/**
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as acorn from 'acorn';
import * as estree from 'estree';
import * as _ from 'lodash';
import * as path from 'path';
import * as semver from 'semver';
import * as vm from 'vm';

import {StatusMessage} from '../status-message';
import * as apiTypes from '../types/api-types';
import {Logger} from '../types/common-types';
import * as v8Types from '../types/v8-types';

import {DebugAgentConfig} from './config';
import * as debugapi from './debugapi';
import {FileStats, ScanStats} from './scanner';
import {MapInfoOutput, SourceMapper} from './sourcemapper';
import * as state from './state';
import * as utils from './utils';

export class V8BreakpointData {
  constructor(
      public apiBreakpoint: apiTypes.Breakpoint,
      public v8Breakpoint: v8Types.BreakPoint,
      public parsedCondition: estree.Node,
      // TODO: The code in this method assumes that `compile` exists.  Verify
      // that is correct.
      // TODO: Update this so that `null|` is not needed for `compile`.
      public compile: null|((src: string) => string)) {}
}

export class V8DebugApi implements debugapi.DebugApi {
  breakpoints: {[id: string]: V8BreakpointData} = {};
  sourcemapper: SourceMapper;
  v8: v8Types.Debug;
  config: DebugAgentConfig;
  fileStats: ScanStats;
  listeners: {[id: string]: utils.Listener} = {};
  v8Version: any;
  usePermanentListener: boolean;
  logger: Logger;
  handleDebugEvents:
      (evt: v8Types.DebugEvent, execState: v8Types.ExecutionState,
       eventData: v8Types.BreakEvent) => void;

  numBreakpoints = 0;

  constructor(
      logger_: Logger, config_: DebugAgentConfig, jsFiles_: ScanStats,
      sourcemapper_: SourceMapper) {
    this.sourcemapper = sourcemapper_;
    this.v8 = vm.runInDebugContext('Debug');
    this.config = config_;
    this.fileStats = jsFiles_;
    this.v8Version = /(\d+\.\d+\.\d+)\.\d+/.exec(process.versions.v8);
    this.logger = logger_;
    this.usePermanentListener = semver.satisfies(this.v8Version[1], '>=4.5');
    this.handleDebugEvents =
        (evt: v8Types.DebugEvent, execState: v8Types.ExecutionState,
         eventData: v8Types.BreakEvent): void => {
          try {
            switch (evt) {
              // TODO: Address the case where `v8` is `null`.
              case this.v8.DebugEvent.Break:
                eventData.breakPointsHit().forEach(hit => {
                  const num = hit.script_break_point().number();
                  if (this.listeners[num].enabled) {
                    this.logger.info('>>>V8 breakpoint hit<<< number: ' + num);
                    this.listeners[num].listener(execState, eventData);
                  }
                });
                break;
              default:
            }
          } catch (e) {
            this.logger.warn('Internal V8 error on breakpoint event: ' + e);
          }
        };
    if (this.usePermanentListener) {
      this.logger.info('activating v8 breakpoint listener (permanent)');

      this.v8.setListener(this.handleDebugEvents);
    }
  }

  set(breakpoint: apiTypes.Breakpoint, cb: (err: Error|null) => void): void {
    if (!this.v8 || !breakpoint ||
        typeof breakpoint.id === 'undefined' ||  // 0 is a valid id
        !breakpoint.location || !breakpoint.location.path ||
        !breakpoint.location.line) {
      return utils.setErrorStatusAndCallback(
          cb, breakpoint, StatusMessage.UNSPECIFIED,
          utils.messages.INVALID_BREAKPOINT);
    }
    const baseScriptPath = path.normalize(breakpoint.location.path);
    if (!this.sourcemapper.hasMappingInfo(baseScriptPath)) {
      if (!_.endsWith(baseScriptPath, '.js')) {
        return utils.setErrorStatusAndCallback(
            cb, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
            utils.messages.COULD_NOT_FIND_OUTPUT_FILE);
      }
      this.setInternal(breakpoint, null /* mapInfo */, null /* compile */, cb);
    } else {
      const line = breakpoint.location.line;
      const column = 0;
      const mapInfo =
          this.sourcemapper.mappingInfo(baseScriptPath, line, column);

      const compile = utils.getBreakpointCompiler(breakpoint);
      if (breakpoint.condition && compile) {
        try {
          breakpoint.condition = compile(breakpoint.condition);
        } catch (e) {
          this.logger.info(
              'Unable to compile condition >> ' + breakpoint.condition + ' <<');
          return utils.setErrorStatusAndCallback(
              cb, breakpoint, StatusMessage.BREAKPOINT_CONDITION,
              utils.messages.ERROR_COMPILING_CONDITION);
        }
      }

      this.setInternal(breakpoint, mapInfo, compile, cb);
    }
  }
  clear(breakpoint: apiTypes.Breakpoint, cb: (err: Error|null) => void): void {
    if (typeof breakpoint.id === 'undefined') {
      return utils.setErrorStatusAndCallback(
          cb, breakpoint, StatusMessage.BREAKPOINT_CONDITION,
          utils.messages.V8_BREAKPOINT_CLEAR_ERROR);
    }
    const breakpointData = this.breakpoints[breakpoint.id];
    if (!breakpointData) {
      return utils.setErrorStatusAndCallback(
          cb, breakpoint, StatusMessage.BREAKPOINT_CONDITION,
          utils.messages.V8_BREAKPOINT_CLEAR_ERROR);
    }
    const v8bp = breakpointData.v8Breakpoint;
    this.v8.clearBreakPoint(v8bp.number());
    delete this.breakpoints[breakpoint.id];
    delete this.listeners[v8bp.number()];
    this.numBreakpoints--;
    if (this.numBreakpoints === 0 && !this.usePermanentListener) {
      // removed last breakpoint
      this.logger.info('deactivating v8 breakpoint listener');
      this.v8.setListener(null);
    }
    return setImmediate(function() {
      cb(null);
    });
  }

  wait(breakpoint: apiTypes.Breakpoint, callback: (err?: Error) => void): void {
    // TODO: Address the case whree `breakpoint.id` is `null`.
    const that = this;
    const num = that.breakpoints[breakpoint.id as string].v8Breakpoint.number();
    const listener =
        this.onBreakpointHit.bind(this, breakpoint, function(err: Error) {
          that.listeners[num].enabled = false;
          // This method is called from the debug event listener, which
          // swallows all exception. We defer the callback to make sure the
          // user errors aren't silenced.
          setImmediate(function() {
            callback(err);
          });
        });

    that.listeners[num] = {enabled: true, listener: listener};
  }

  log(breakpoint: apiTypes.Breakpoint,
      print: (format: string, exps: string[]) => void,
      shouldStop: () => boolean): void {
    const that = this;
    // TODO: Address the case whree `breakpoint.id` is `null`.
    const num = that.breakpoints[breakpoint.id as string].v8Breakpoint.number();
    let logsThisSecond = 0;
    let timesliceEnd = Date.now() + 1000;
    // TODO: Determine why the Error argument is not used.
    const listener =
        this.onBreakpointHit.bind(this, breakpoint, function(_err: Error) {
          const currTime = Date.now();
          if (currTime > timesliceEnd) {
            logsThisSecond = 0;
            timesliceEnd = currTime + 1000;
          }
          print(
              // TODO: Address the case where `breakpoint.logMessageFormat` is
              // `null`.
              breakpoint.logMessageFormat as string,
              // TODO: Determine how to remove the `as` cast below
              breakpoint.evaluatedExpressions.map(
                  JSON.stringify as (ob: any) => string));
          logsThisSecond++;
          if (shouldStop()) {
            that.listeners[num].enabled = false;
          } else {
            if (logsThisSecond >= that.config.log.maxLogsPerSecond) {
              that.listeners[num].enabled = false;
              setTimeout(function() {
                // listeners[num] may have been deleted by `clear` during the
                // async hop. Make sure it is valid before setting a property
                // on it.
                if (!shouldStop() && that.listeners[num]) {
                  that.listeners[num].enabled = true;
                }
              }, that.config.log.logDelaySeconds * 1000);
            }
          }
        });
    that.listeners[num] = {enabled: true, listener: listener};
  }

  disconnect(): void {
    return;
  }

  numBreakpoints_(): number {
    return Object.keys(this.breakpoints).length;
  }

  numListeners_(): number {
    return Object.keys(this.listeners).length;
  }


  setInternal(
      breakpoint: apiTypes.Breakpoint, mapInfo: MapInfoOutput|null,
      compile: ((src: string) => string)|null,
      cb: (err: Error|null) => void): void {
    // Parse and validate conditions and watch expressions for correctness and
    // immutability
    let ast = null;
    if (breakpoint.condition) {
      try {
        // We parse as ES6; even though the underlying V8 version may only
        // support a subset. This should be fine as the objective of the parse
        // is to heuristically find side-effects. V8 will raise errors later
        // if the syntax is invalid. It would have been nice if V8 had made the
        // parser API available us :(.
        ast = acorn.parse(
            breakpoint.condition, {sourceType: 'script', ecmaVersion: 6});
        const validator = require('./validator.js');
        if (!validator.isValid(ast)) {
          return utils.setErrorStatusAndCallback(
              cb, breakpoint, StatusMessage.BREAKPOINT_CONDITION,
              utils.messages.DISALLOWED_EXPRESSION);
        }
      } catch (err) {
        return utils.setErrorStatusAndCallback(
            cb, breakpoint, StatusMessage.BREAKPOINT_CONDITION,
            utils.messages.SYNTAX_ERROR_IN_CONDITION + err.message);
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
    const scripts = utils.findScripts(
        mapInfo ? mapInfo.file :
                  path.normalize(
                      (breakpoint.location as apiTypes.SourceLocation).path),
        this.config, this.fileStats);
    if (scripts.length === 0) {
      return utils.setErrorStatusAndCallback(
          cb, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
          utils.messages.SOURCE_FILE_NOT_FOUND);
    } else if (scripts.length === 1) {
      // Found the script
      matchingScript = scripts[0];
    } else {
      return utils.setErrorStatusAndCallback(
          cb, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
          utils.messages.SOURCE_FILE_AMBIGUOUS);
    }

    // TODO: Address the case where `breakpoint.location` is `null`.
    // TODO: Address the case where `fileStats[matchingScript]` is `null`.
    if ((breakpoint.location as apiTypes.SourceLocation).line >=
        (this.fileStats[matchingScript] as FileStats).lines) {
      return utils.setErrorStatusAndCallback(
          cb, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
          utils.messages.INVALID_LINE_NUMBER + matchingScript + ':' +
              (breakpoint.location as apiTypes.SourceLocation).line +
              '. Loaded script contained ' +
              (this.fileStats[matchingScript] as FileStats).lines +
              ' lines. Please ensure' +
              ' that the snapshot was set in the same code version as the' +
              ' deployed source.');
    }
    // The breakpoint protobuf message presently doesn't have a column property
    // but it may have one in the future.
    // TODO: Address the case where `breakpoint.location` is `null`.
    let column = mapInfo && mapInfo.column ?
        mapInfo.column :
        ((breakpoint.location as apiTypes.SourceLocation).column || 1);
    const line = mapInfo ?
        mapInfo.line :
        (breakpoint.location as apiTypes.SourceLocation).line;

    // We need to special case breakpoints on the first line. Since Node.js
    // wraps modules with a function expression, we adjust
    // to deal with that.
    if (line === 1) {
      column += debugapi.MODULE_WRAP_PREFIX_LENGTH - 1;
    }

    const v8bp = this.setByRegExp(matchingScript, line, column);
    if (!v8bp) {
      return utils.setErrorStatusAndCallback(
          cb, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
          utils.messages.V8_BREAKPOINT_ERROR);
    }
    if (this.numBreakpoints === 0 && !this.usePermanentListener) {
      // added first breakpoint
      this.logger.info('activating v8 breakpoint listener');
      this.v8.setListener(this.handleDebugEvents);
    }
    // TODO: Address the case whree `breakpoint.id` is `null`.
    this.breakpoints[breakpoint.id as string] =
        // TODO: Address the case where `ast` is `null`.
        new V8BreakpointData(breakpoint, v8bp, ast as estree.Program, compile);
    this.numBreakpoints++;
    setImmediate(function() {
      cb(null);
    });  // success.
  }

  setByRegExp(scriptPath: string, line: number, column: number):
      v8Types.BreakPoint {
    const regexp = utils.pathToRegExp(scriptPath);
    const num =
        this.v8.setScriptBreakPointByRegExp(regexp, line - 1, column - 1);
    const v8bp = this.v8.findBreakPoint(num);
    return v8bp;
  }

  onBreakpointHit(
      breakpoint: apiTypes.Breakpoint, callback: (err: Error|null) => void,
      execState: v8Types.ExecutionState): void {
    // TODO: Address the situation where `breakpoint.id` is `null`.
    const v8bp = this.breakpoints[breakpoint.id as string].v8Breakpoint;
    if (!v8bp.active()) {
      // Breakpoint exists, but not active. We never disable breakpoints, so
      // this is theoretically not possible. Perhaps this is possible if there
      // is a second debugger present? Regardless, report the error.
      return utils.setErrorStatusAndCallback(
          callback, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
          utils.messages.V8_BREAKPOINT_DISABLED);
    }

    const result = this.checkCondition(breakpoint, execState);
    if (result.error) {
      return utils.setErrorStatusAndCallback(
          callback, breakpoint, StatusMessage.BREAKPOINT_CONDITION,
          utils.messages.ERROR_EVALUATING_CONDITION + result.error);
    } else if (!result.value) {
      // Check again next time
      this.logger.info('\tthe breakpoint condition wasn\'t met');
      return;
    }

    // Breakpoint Hit
    const start = process.hrtime();
    try {
      this.captureBreakpointData(breakpoint, execState);
    } catch (err) {
      return utils.setErrorStatusAndCallback(
          callback, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
          utils.messages.CAPTURE_BREAKPOINT_DATA + err);
    }
    const end = process.hrtime(start);
    this.logger.info(utils.formatInterval('capture time: ', end));
    callback(null);
  }

  /**
   * Evaluates the breakpoint condition, if present.
   * @return object with either a boolean value or an error property
   */
  checkCondition(
      breakpoint: apiTypes.Breakpoint,
      execState: v8Types.ExecutionState): {value?: boolean, error?: string} {
    if (!breakpoint.condition) {
      return {value: true};
    }

    const result = state.evaluate(breakpoint.condition, execState.frame(0));

    if (result.error) {
      return {error: result.error};
    }
    // TODO: Address the case where `result.mirror` is `null`.
    return {
      value: !!((result.mirror as v8Types.ValueMirror).value())
    };  // intentional !!
  }

  captureBreakpointData(
      breakpoint: apiTypes.Breakpoint,
      execState: v8Types.ExecutionState): void {
    const expressionErrors: Array<apiTypes.Variable|null> = [];
    // TODO: Address the case where `breakpoint.id` is `null`.
    if (breakpoint.expressions &&
        this.breakpoints[breakpoint.id as string].compile) {
      for (let i = 0; i < breakpoint.expressions.length; i++) {
        try {
          // TODO: Address the case where `breakpoint.id` is `null`.
          breakpoint.expressions[i] =
              // TODO: Address the case where `compile` is `null`.
              (this.breakpoints[breakpoint.id as string].compile as
                   (text: string) => string)(breakpoint.expressions[i]);
        } catch (e) {
          this.logger.info(
              'Unable to compile watch expression >> ' +
              breakpoint.expressions[i] + ' <<');
          expressionErrors.push({
            name: breakpoint.expressions[i],
            status: new StatusMessage(
                StatusMessage.VARIABLE_VALUE, 'Error Compiling Expression',
                true)
          });
          breakpoint.expressions.splice(i, 1);
        }
      }
    }
    if (breakpoint.action === 'LOG') {
      // TODO: This doesn't work with compiled languages if there is an error
      // compiling one of the expressions in the loop above.
      if (!breakpoint.expressions) {
        breakpoint.evaluatedExpressions = [];
      } else {
        const frame = execState.frame(0);
        const evaluatedExpressions = breakpoint.expressions.map(function(exp) {
          const result = state.evaluate(exp, frame);
          // TODO: Address the case where `result.mirror` is `undefined`.
          return result.error ? result.error :
                                (result.mirror as v8Types.ValueMirror).value();
        });
        breakpoint.evaluatedExpressions = evaluatedExpressions;
      }
    } else {
      // TODO: Address the case where `breakpoint.expression` is `undefined`.
      const captured = state.capture(
          execState, breakpoint.expressions as string[], this.config, this.v8);
      if (breakpoint.location && captured.location && captured.location.line) {
        breakpoint.location.line = captured.location.line;
      }
      breakpoint.stackFrames = captured.stackFrames;
      // TODO: This suggests the Status type and Variable type are the same.
      //       Determine if that is the case.
      breakpoint.variableTable = captured.variableTable as apiTypes.Variable[];
      breakpoint.evaluatedExpressions =
          expressionErrors.concat(captured.evaluatedExpressions);
    }
  }
}
