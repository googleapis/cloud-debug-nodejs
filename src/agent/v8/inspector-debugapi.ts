// Copyright 2017 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as acorn from 'acorn';
import * as estree from 'estree';
// eslint-disable-next-line node/no-unsupported-features/node-builtins
import * as inspector from 'inspector';
import * as path from 'path';

import {StatusMessage} from '../../client/stackdriver/status-message';
import consoleLogLevel = require('console-log-level');
import * as stackdriver from '../../types/stackdriver';
import {ResolvedDebugAgentConfig} from '../config';
import {FileStats, ScanStats} from '../io/scanner';
import {
  MapInfoOutput,
  SourceMapper,
  MultiFileMatchError,
} from '../io/sourcemapper';
import * as state from '../state/inspector-state';
import * as utils from '../util/utils';

import * as debugapi from './debugapi';
import {V8Inspector} from './v8inspector';

/**
 * An interface that describes options that set behavior when interacting with
 * the V8 Inspector API.
 */
interface InspectorOptions {
  /**
   * Whether to add a 'file://' prefix to a URL when setting breakpoints.
   */
  useWellFormattedUrl: boolean;
}

/** Data related to the v8 inspector. */
interface V8Data {
  session: inspector.Session;
  // Options for behavior when interfacing with the Inspector API.
  inspectorOptions: InspectorOptions;
  inspector: V8Inspector;
  // Store the v8 setBreakpoint parameters for each v8 breakpoint so that later
  // the recorded parameters can be used to reset the breakpoints.
  setBreakpointsParams: {
    [
      v8BreakpointId: string
    ]: inspector.Debugger.SetBreakpointByUrlParameterType;
  };
}

/**
 * In older versions of Node, the script source as seen by the Inspector
 * backend is wrapped in `require('module').wrapper`, and in new versions
 * (Node 10.16+, Node 11.11+, Node 12+) it's not. This affects line-1
 * breakpoints.
 */
const USE_MODULE_PREFIX = utils.satisfies(
  process.version,
  '<10.16 || >=11 <11.11'
);

export class BreakpointData {
  constructor(
    public id: inspector.Debugger.BreakpointId,
    public apiBreakpoint: stackdriver.Breakpoint,
    public parsedCondition: estree.Node,
    public locationStr: string,
    public compile: null | ((src: string) => string)
  ) {}
}

export class InspectorDebugApi implements debugapi.DebugApi {
  logger: consoleLogLevel.Logger;
  config: ResolvedDebugAgentConfig;
  fileStats: ScanStats;
  breakpoints: {[id: string]: BreakpointData} = {};
  sourcemapper: SourceMapper;
  // TODO: listeners, scrpitmapper, location mapper and breakpointmapper can use
  // Map in the future after resolving Map.prototype.get(key) returns V or
  // undefined.
  listeners: {[id: string]: utils.InspectorListener} = {};
  // scriptmapper maps scriptId to actual script path.
  scriptMapper: {[id: string]: {url: string}} = {};
  // locationmapper maps location string to a list of stackdriver breakpoint id.
  locationMapper: {[id: string]: stackdriver.BreakpointId[]} = {};
  // breakpointmapper maps v8/inspector breakpoint id to a list of
  // stackdriver breakpoint id.
  breakpointMapper: {[id: string]: stackdriver.BreakpointId[]} = {};
  numBreakpoints = 0;
  numBreakpointHitsBeforeReset = 0;
  v8: V8Data;

  constructor(
    logger: consoleLogLevel.Logger,
    config: ResolvedDebugAgentConfig,
    jsFiles: ScanStats,
    sourcemapper: SourceMapper
  ) {
    this.logger = logger;
    this.config = config;
    this.fileStats = jsFiles;
    this.sourcemapper = sourcemapper;
    this.scriptMapper = {};
    this.v8 = this.createV8Data();
  }

  /** Creates a new V8 Debugging session and the related data. */
  private createV8Data(): V8Data {
    const session = new inspector.Session();
    session.connect();
    session.on('Debugger.scriptParsed', script => {
      this.scriptMapper[script.params.scriptId] = script.params;
    });
    session.post('Debugger.enable');
    session.post('Debugger.setBreakpointsActive', {active: true});
    session.on('Debugger.paused', message => {
      try {
        this.handleDebugPausedEvent(message.params);
      } catch (error) {
        this.logger.error(error);
      }
    });

    return {
      session,
      inspectorOptions: {
        // Well-Formatted URL is required in Node 10.11.1+.
        useWellFormattedUrl: utils.satisfies(process.version, '>10.11.0'),
      },
      inspector: new V8Inspector(session),
      setBreakpointsParams: {},
    };
  }

  set(
    breakpoint: stackdriver.Breakpoint,
    cb: (err: Error | null) => void
  ): void {
    if (
      !breakpoint ||
      typeof breakpoint.id === 'undefined' || // 0 is a valid id
      !breakpoint.location ||
      !breakpoint.location.path ||
      !breakpoint.location.line
    ) {
      return utils.setErrorStatusAndCallback(
        cb,
        breakpoint,
        StatusMessage.UNSPECIFIED,
        utils.messages.INVALID_BREAKPOINT
      );
    }
    const baseScriptPath = path.normalize(breakpoint.location.path);
    let mapInfoInput = null;
    try {
      mapInfoInput = this.sourcemapper.getMapInfoInput(baseScriptPath);
    } catch (error) {
      if (error instanceof MultiFileMatchError) {
        this.logger.warn(
          `Unable to unambiguously find ${baseScriptPath}. Multiple matches: ${error.files}`
        );
        return utils.setErrorStatusAndCallback(
          cb,
          breakpoint,
          StatusMessage.BREAKPOINT_SOURCE_LOCATION,
          utils.messages.SOURCE_FILE_AMBIGUOUS
        );
      } else {
        throw error;
      }
    }

    if (mapInfoInput === null) {
      const extension = path.extname(baseScriptPath);
      if (!this.config.javascriptFileExtensions.includes(extension)) {
        return utils.setErrorStatusAndCallback(
          cb,
          breakpoint,
          StatusMessage.BREAKPOINT_SOURCE_LOCATION,
          utils.messages.COULD_NOT_FIND_OUTPUT_FILE
        );
      }

      this.setInternal(breakpoint, null /* mapInfo */, null /* compile */, cb);
    } else {
      const line = breakpoint.location.line;
      const column = 0;
      const mapInfo = this.sourcemapper.getMapInfoOutput(
        line,
        column,
        mapInfoInput
      );

      const compile = utils.getBreakpointCompiler(breakpoint);
      if (breakpoint.condition && compile) {
        try {
          breakpoint.condition = compile(breakpoint.condition);
        } catch (e) {
          this.logger.info(
            'Unable to compile condition >> ' + breakpoint.condition + ' <<'
          );
          return utils.setErrorStatusAndCallback(
            cb,
            breakpoint,
            StatusMessage.BREAKPOINT_CONDITION,
            utils.messages.ERROR_COMPILING_CONDITION
          );
        }
      }
      this.setInternal(breakpoint, mapInfo, compile, cb);
    }
  }

  clear(
    breakpoint: stackdriver.Breakpoint,
    cb: (err: Error | null) => void
  ): void {
    if (typeof breakpoint.id === 'undefined') {
      return utils.setErrorStatusAndCallback(
        cb,
        breakpoint,
        StatusMessage.BREAKPOINT_CONDITION,
        utils.messages.V8_BREAKPOINT_CLEAR_ERROR
      );
    }
    const breakpointData = this.breakpoints[breakpoint.id];
    if (!breakpointData) {
      return utils.setErrorStatusAndCallback(
        cb,
        breakpoint,
        StatusMessage.BREAKPOINT_CONDITION,
        utils.messages.V8_BREAKPOINT_CLEAR_ERROR
      );
    }
    const locationStr = breakpointData.locationStr;
    const v8BreakpointId = breakpointData.id;

    // delete current breakpoint from locationmapper and breakpointmapper.
    utils.removeFirstOccurrenceInArray(
      this.locationMapper[locationStr],
      breakpoint.id
    );
    if (this.locationMapper[locationStr].length === 0) {
      delete this.locationMapper[locationStr];
    }
    utils.removeFirstOccurrenceInArray(
      this.breakpointMapper[v8BreakpointId],
      breakpoint.id
    );
    if (this.breakpointMapper[v8BreakpointId].length === 0) {
      delete this.breakpointMapper[v8BreakpointId];
    }

    let result: {error?: Error} = {};
    if (!this.breakpointMapper[breakpointData.id]) {
      // When breakpointmapper does not countain current v8/inspector breakpoint
      // id, we should remove this breakpoint from v8.
      result = this.v8.inspector.removeBreakpoint(breakpointData.id);
      delete this.v8.setBreakpointsParams[breakpointData.id];
    }
    delete this.breakpoints[breakpoint.id];
    delete this.listeners[breakpoint.id];
    this.numBreakpoints--;
    setImmediate(() => {
      if (result.error) {
        cb(result.error);
      }
      cb(null);
    });
  }

  wait(
    breakpoint: stackdriver.Breakpoint,
    callback: (err?: Error) => void
  ): void {
    // TODO: Address the case whree `breakpoint.id` is `null`.
    const listener = this.onBreakpointHit.bind(
      this,
      breakpoint,
      (err: Error | null) => {
        this.listeners[breakpoint.id].enabled = false;
        // This method is called from the debug event listener, which
        // swallows all exception. We defer the callback to make sure
        // the user errors aren't silenced.
        setImmediate(() => {
          callback(err || undefined);
        });
      }
    );
    this.listeners[breakpoint.id] = {enabled: true, listener};
  }

  log(
    breakpoint: stackdriver.Breakpoint,
    print: (format: string, exps: string[]) => void,
    shouldStop: () => boolean
  ): void {
    // TODO: Address the case whree `breakpoint.id` is `null`.
    let logsThisSecond = 0;
    let timesliceEnd = Date.now() + 1000;
    // TODO: Determine why the Error argument is not used.
    const listener = this.onBreakpointHit.bind(this, breakpoint, () => {
      const currTime = Date.now();
      if (currTime > timesliceEnd) {
        logsThisSecond = 0;
        timesliceEnd = currTime + 1000;
      }
      print(
        // TODO: Address the case where `breakpoint.logMessageFormat` is
        // `null`.
        breakpoint.logMessageFormat as string,
        breakpoint.evaluatedExpressions.map(
          (obj: stackdriver.Variable | null) => JSON.stringify(obj)
        )
      );
      logsThisSecond++;
      if (shouldStop()) {
        this.listeners[breakpoint.id].enabled = false;
      } else {
        if (logsThisSecond >= this.config.log.maxLogsPerSecond) {
          this.listeners[breakpoint.id].enabled = false;
          setTimeout(() => {
            // listeners[num] may have been deleted by `clear` during the
            // async hop. Make sure it is valid before setting a property
            // on it.
            if (!shouldStop() && this.listeners[breakpoint.id]) {
              this.listeners[breakpoint.id].enabled = true;
            }
          }, this.config.log.logDelaySeconds * 1000);
        }
      }
    });
    this.listeners[breakpoint.id] = {enabled: true, listener};
  }

  disconnect(): void {
    this.v8.session.disconnect();
  }

  numBreakpoints_(): number {
    // Tracks the number of stackdriver breakpoints.
    return Object.keys(this.breakpoints).length;
  }

  numListeners_(): number {
    return Object.keys(this.listeners).length;
  }

  /**
   * Internal breakpoint set function. At this point we have looked up source
   * maps (if necessary), and scriptPath happens to be a JavaScript path.
   *
   * @param {!Breakpoint} breakpoint Debug API Breakpoint object
   * @param {!MapInfoOutput|null} mapInfo A map that has a "file" attribute for
   *    the path of the output file associated with the given input file
   * @param {function(string)=} compile optional compile function that can be
   *    be used to compile source expressions to JavaScript
   * @param {function(?Error)} cb error-back style callback
   */
  // TODO: Fix the documented types to match the function's input types
  // TODO: Unify this function with setInternal in v8debugapi.ts.
  private setInternal(
    breakpoint: stackdriver.Breakpoint,
    mapInfo: MapInfoOutput | null,
    compile: ((src: string) => string) | null,
    cb: (err: Error | null) => void
  ): void {
    // Parse and validate conditions and watch expressions for correctness and
    // immutability
    let ast: acorn.Node | null = null;
    if (breakpoint.condition) {
      try {
        // We parse as ES6; even though the underlying V8 version may only
        // support a subset. This should be fine as the objective of the parse
        // is to heuristically find side-effects. V8 will raise errors later
        // if the syntax is invalid. It would have been nice if V8 had made
        // the parser API available us :(.
        ast = acorn.parse(breakpoint.condition, {
          sourceType: 'script',
          ecmaVersion: 6,
        });
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const validator = require('../util/validator.js');
        if (!validator.isValid(ast)) {
          return utils.setErrorStatusAndCallback(
            cb,
            breakpoint,
            StatusMessage.BREAKPOINT_CONDITION,
            utils.messages.DISALLOWED_EXPRESSION
          );
        }
      } catch (e) {
        const message =
          utils.messages.SYNTAX_ERROR_IN_CONDITION + (e as Error).message;
        return utils.setErrorStatusAndCallback(
          cb,
          breakpoint,
          StatusMessage.BREAKPOINT_CONDITION,
          message
        );
      }
    }

    // Presently it is not possible to precisely disambiguate the script
    // path from the path provided by the debug server. The issue is that we
    // don't know the repository root relative to the root filesystem or
    // relative to the working-directory of the process. We want to make sure
    // that we are setting the breakpoint that the user intended instead of a
    // breakpoint in a file that happens to have the same name but is in a
    // different directory. Until this is addressed between the server and the
    // debuglet, we are going to assume that repository root === the starting
    // working directory.
    let matchingScript;
    // TODO: Address the case where `breakpoint.location` is `null`.
    const scriptPath = mapInfo
      ? mapInfo.file
      : path.normalize(
          (breakpoint.location as stackdriver.SourceLocation).path
        );
    const scripts = utils.findScripts(
      scriptPath,
      this.config,
      this.fileStats,
      this.logger
    );
    if (scripts.length === 0) {
      return utils.setErrorStatusAndCallback(
        cb,
        breakpoint,
        StatusMessage.BREAKPOINT_SOURCE_LOCATION,
        utils.messages.SOURCE_FILE_NOT_FOUND
      );
    } else if (scripts.length === 1) {
      // Found the script
      matchingScript = scripts[0];
    } else {
      this.logger.warn(
        `Unable to unambiguously find ${scriptPath}. Potential matches: ${scripts}`
      );
      return utils.setErrorStatusAndCallback(
        cb,
        breakpoint,
        StatusMessage.BREAKPOINT_SOURCE_LOCATION,
        utils.messages.SOURCE_FILE_AMBIGUOUS
      );
    }

    // The breakpoint protobuf message presently doesn't have a column
    // property but it may have one in the future.
    // TODO: Address the case where `breakpoint.location` is `null`.
    let column =
      mapInfo && mapInfo.column
        ? mapInfo.column
        : (breakpoint.location as stackdriver.SourceLocation).column || 1;
    const line = mapInfo
      ? mapInfo.line
      : (breakpoint.location as stackdriver.SourceLocation).line;
    // In older versions of Node, since Node.js wraps modules with a function
    // expression, we need to special case breakpoints on the first line.
    if (USE_MODULE_PREFIX && line === 1) {
      column += debugapi.MODULE_WRAP_PREFIX_LENGTH - 1;
    }

    // TODO: Address the case where `breakpoint.location` is `null`.
    // TODO: Address the case where `fileStats[matchingScript]` is `null`.
    if (line >= (this.fileStats[matchingScript] as FileStats).lines) {
      return utils.setErrorStatusAndCallback(
        cb,
        breakpoint,
        StatusMessage.BREAKPOINT_SOURCE_LOCATION,
        utils.messages.INVALID_LINE_NUMBER +
          matchingScript +
          ':' +
          line +
          '. Loaded script contained ' +
          (this.fileStats[matchingScript] as FileStats).lines +
          ' lines. Please ensure' +
          ' that the snapshot was set in the same code version as the' +
          ' deployed source.'
      );
    }

    const result = this.setAndStoreBreakpoint(
      breakpoint,
      line,
      column,
      matchingScript
    );
    if (!result) {
      return utils.setErrorStatusAndCallback(
        cb,
        breakpoint,
        StatusMessage.BREAKPOINT_SOURCE_LOCATION,
        utils.messages.V8_BREAKPOINT_ERROR
      );
    }

    this.breakpoints[breakpoint.id] = new BreakpointData(
      result.v8BreakpointId,
      breakpoint,
      ast as estree.Node,
      result.locationStr,
      compile
    );

    this.numBreakpoints++;
    setImmediate(() => {
      cb(null);
    }); // success.
  }

  private setAndStoreBreakpoint(
    breakpoint: stackdriver.Breakpoint,
    line: number,
    column: number,
    matchingScript: string
  ): {
    v8BreakpointId: inspector.Debugger.BreakpointId;
    locationStr: string;
  } | null {
    // location Str will be a JSON string of Stackdriver breakpoint location.
    // It will be used as key at locationmapper to ensure there will be no
    // duplicate breakpoints at the same location.
    const locationStr = JSON.stringify(breakpoint.location);
    let v8BreakpointId; // v8/inspector breakpoint id
    if (!this.locationMapper[locationStr]) {
      // The first time when a breakpoint was set to this location.
      const rawUrl = this.v8.inspectorOptions.useWellFormattedUrl
        ? `file://${matchingScript}`
        : matchingScript;
      // on windows on Node 11+, the url must start with file:///
      // (notice 3 slashes) and have all backslashes converted into forward slashes
      const url =
        process.platform === 'win32' && utils.satisfies(process.version, '>=11')
          ? rawUrl.replace(/^file:\/\//, 'file:///').replace(/\\/g, '/')
          : rawUrl;
      const params = {
        lineNumber: line - 1,
        url,
        columnNumber: column - 1,
        condition: breakpoint.condition || undefined,
      };
      const res = this.v8.inspector.setBreakpointByUrl(params);
      if (res.error || !res.response) {
        // Error case.
        return null;
      }
      v8BreakpointId = res.response.breakpointId;
      this.v8.setBreakpointsParams[v8BreakpointId] = params;

      this.locationMapper[locationStr] = [];
      this.breakpointMapper[v8BreakpointId] = [];
    } else {
      // Breakpoint found at this location. Acquire the v8/inspector breakpoint
      // id.
      v8BreakpointId = this.breakpoints[this.locationMapper[locationStr][0]].id;
    }

    // Adding current stackdriver breakpoint id to location mapper and
    // breakpoint mapper.
    this.locationMapper[locationStr].push(breakpoint.id);
    this.breakpointMapper[v8BreakpointId].push(breakpoint.id);

    return {v8BreakpointId, locationStr};
  }

  private onBreakpointHit(
    breakpoint: stackdriver.Breakpoint,
    callback: (err: Error | null) => void,
    callFrames: inspector.Debugger.CallFrame[]
  ): void {
    // Breakpoint Hit
    const start = process.hrtime();
    try {
      this.captureBreakpointData(breakpoint, callFrames);
    } catch (err) {
      return utils.setErrorStatusAndCallback(
        callback,
        breakpoint,
        StatusMessage.BREAKPOINT_SOURCE_LOCATION,
        utils.messages.CAPTURE_BREAKPOINT_DATA + err
      );
    }
    const end = process.hrtime(start);
    this.logger.info(utils.formatInterval('capture time: ', end));
    callback(null);
  }

  private captureBreakpointData(
    breakpoint: stackdriver.Breakpoint,
    callFrames: inspector.Debugger.CallFrame[]
  ): void {
    const expressionErrors: Array<stackdriver.Variable | null> = [];
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;
    // TODO: Address the case where `breakpoint.id` is `null`.
    if (breakpoint.expressions && this.breakpoints[breakpoint.id].compile) {
      for (let i = 0; i < breakpoint.expressions.length; i++) {
        try {
          // TODO: Address the case where `breakpoint.id` is `null`.
          breakpoint.expressions[i] =
            // TODO: Address the case where `compile` is `null`.
            (
              this.breakpoints[breakpoint.id].compile as (
                text: string
              ) => string
            )(breakpoint.expressions[i]);
        } catch (e) {
          this.logger.info(
            'Unable to compile watch expression >> ' +
              breakpoint.expressions[i] +
              ' <<'
          );
          expressionErrors.push({
            name: breakpoint.expressions[i],
            status: new StatusMessage(
              StatusMessage.VARIABLE_VALUE,
              'Error Compiling Expression',
              true
            ),
          });
          breakpoint.expressions.splice(i, 1);
          i--;
        }
      }
    }
    if (breakpoint.action === 'LOG') {
      // TODO: This doesn't work with compiled languages if there is an error
      // compiling one of the expressions in the loop above.
      if (!breakpoint.expressions) {
        breakpoint.evaluatedExpressions = [];
      } else {
        const frame = callFrames[0];
        const evaluatedExpressions = breakpoint.expressions.map(exp => {
          // returnByValue is set to true here so that the JSON string of the
          // value will be returned to log.
          const result = state.evaluate(exp, frame, that.v8.inspector, true);
          if (result.error) {
            return result.error;
          } else {
            return (result.object as inspector.Runtime.RemoteObject).value;
          }
        });
        breakpoint.evaluatedExpressions = evaluatedExpressions;
      }
    } else {
      const captured = state.capture(
        callFrames,
        breakpoint,
        this.config,
        this.scriptMapper,
        this.v8.inspector
      );
      if (
        breakpoint.location &&
        utils.isJavaScriptFile(breakpoint.location.path)
      ) {
        breakpoint.location.line = callFrames[0].location.lineNumber + 1;
      }
      breakpoint.stackFrames = captured.stackFrames;
      // TODO: This suggests the Status type and Variable type are the same.
      //       Determine if that is the case.
      breakpoint.variableTable =
        captured.variableTable as stackdriver.Variable[];
      breakpoint.evaluatedExpressions = expressionErrors.concat(
        captured.evaluatedExpressions
      );
    }
  }

  private handleDebugPausedEvent(
    params: inspector.Debugger.PausedEventDataType
  ) {
    try {
      if (!params.hitBreakpoints) return;
      const v8BreakpointId: string = params.hitBreakpoints[0];
      this.breakpointMapper[v8BreakpointId].forEach((id: string) => {
        if (this.listeners[id].enabled) {
          this.logger.info('>>>breakpoint hit<<< number: ' + id);
          this.listeners[id].listener(params.callFrames);
        }
      });
    } catch (e) {
      this.logger.warn('Internal V8 error on breakpoint event: ' + e);
    }

    this.tryResetV8Debugger();
  }

  /**
   * Periodically resets breakpoints to prevent memory leaks in V8 (for holding
   * contexts of previous breakpoint hits).
   */
  private tryResetV8Debugger() {
    this.numBreakpointHitsBeforeReset += 1;
    if (
      this.numBreakpointHitsBeforeReset < this.config.resetV8DebuggerThreshold
    ) {
      return;
    }
    this.numBreakpointHitsBeforeReset = 0;

    const storedParams = this.v8.setBreakpointsParams;

    // Re-connect the session to clean the memory usage.
    this.disconnect();
    this.scriptMapper = {};
    this.v8 = this.createV8Data();
    this.v8.setBreakpointsParams = storedParams;

    // Setting the v8 breakpoints again according to the stored parameters.
    for (const params of Object.values(storedParams)) {
      const res = this.v8.inspector.setBreakpointByUrl(params);
      if (res.error || !res.response) {
        this.logger.error('Error upon re-setting breakpoint: ' + res);
      }
    }
  }
}
