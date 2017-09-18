/**
 * Copyright 2014, 2015 Google Inc. All Rights Reserved.
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
import {FileStats, ScanStats} from './scanner';
import {MapInfoOutput, SourceMapper} from './sourcemapper';
import * as state from './state';

const messages = {
  INVALID_BREAKPOINT: 'invalid snapshot - id or location missing',
  SOURCE_FILE_NOT_FOUND:
      'A script matching the source file was not found loaded on the debuggee',
  SOURCE_FILE_AMBIGUOUS: 'Multiple files match the path specified',
  V8_BREAKPOINT_ERROR: 'Unable to set breakpoint in v8',
  V8_BREAKPOINT_CLEAR_ERROR: 'Unable to clear breakpoint in v8',
  SYNTAX_ERROR_IN_CONDITION: 'Syntax error in condition: ',
  ERROR_EVALUATING_CONDITION: 'Error evaluating condition: ',
  ERROR_COMPILING_CONDITION: 'Error compiling condition.',
  DISALLOWED_EXPRESSION: 'Expression not allowed',
  SOURCE_MAP_READ_ERROR:
      'The source map could not be read or was incorrectly formatted',
  V8_BREAKPOINT_DISABLED: 'Internal error: V8 breakpoint externally disabled',
  CAPTURE_BREAKPOINT_DATA: 'Error trying to capture snapshot data: ',
  INVALID_LINE_NUMBER: 'Invalid snapshot position: ',
  COULD_NOT_FIND_OUTPUT_FILE:
      'Could not determine the output file associated with the transpiled input file'
};

const MODULE_WRAP_PREFIX_LENGTH = require('module').wrap('☃').indexOf('☃');

export interface V8DebugApi {
  set: (breakpoint: apiTypes.Breakpoint, cb: (err: Error|null) => void) => void;
  clear:
      (breakpoint: apiTypes.Breakpoint, cb: (err: Error|null) => void) => void;
  wait:
      (breakpoint: apiTypes.Breakpoint,
       callback: (err?: Error) => void) => void;
  log:
      (breakpoint: apiTypes.Breakpoint,
       print: (format: string, exps: string[]) => void,
       shouldStop: () => boolean) => void;
  messages: {[key: string]: string};
  numBreakpoints_: () => number;
  numListeners_: () => number;
}

class BreakpointData {
  constructor(
      public apiBreakpoint: apiTypes.Breakpoint,
      public v8Breakpoint: v8Types.BreakPoint,
      public parsedCondition: estree.Node,
      // TODO: The code in this method assumes that `compile` exists.  Verify
      // that is correct.
      // TODO: Update this so that `null|` is not needed for `compile`.
      public compile: null|((src: string) => string)) {}
}

/**
 * Formats a provided message and a high-resolution interval of the format
 * [seconds, nanoseconds] (for example, from process.hrtime()) prefixed with a
 * provided message as a string intended for logging.
 * @param {string} msg The mesage that prefixes the formatted interval.
 * @param {number[]} interval The interval to format.
 * @return {string} A formatted string.
 */
const formatInterval = function(msg: string, interval: number[]): string {
  return msg + (interval[0] * 1000 + interval[1] / 1000000) + 'ms';
};

let singleton: V8DebugApi;
export function create(
    logger_: Logger, config_: DebugAgentConfig, jsFiles_: ScanStats,
    sourcemapper_: SourceMapper): V8DebugApi|null {
  if (singleton && !config_.forceNewAgent_) {
    return singleton;
  }

  let v8: v8Types.Debug;
  let logger: Logger;
  let config: DebugAgentConfig;
  let fileStats: ScanStats;
  let breakpoints: {[id: string]: BreakpointData} = {};
  let sourcemapper: SourceMapper;
  // Entries map breakpoint id to { enabled: <bool>, listener: <function> }
  // TODO: Determine if the listener type is correct
  const listeners:
      {[id: string]: {enabled: boolean;
                      listener: (...args: any[]) => any;}} = {};
  let numBreakpoints = 0;
  // Before V8 4.5, having a debug listener active disables optimization. To
  // deal with this we only activate the listener when there is a breakpoint
  // active, and remote it as soon as the snapshot is taken. Furthermore, 4.5
  // changes the API such that Debug.scripts() crashes unless a listener is
  // active. We use a permanent listener on V8 4.5+.
  const v8Version = /(\d+\.\d+\.\d+)\.\d+/.exec(process.versions.v8);
  if (!v8Version || v8Version.length < 2) {
    return null;
  }
  const usePermanentListener = semver.satisfies(v8Version[1], '>=4.5');

  // Node.js v0.11+ have the runInDebugContext method that can be used to fetch
  // the API object.
  if (!vm.runInDebugContext) {
    return null;
  }

  v8 = vm.runInDebugContext('Debug');
  logger = logger_;
  config = config_;
  fileStats = jsFiles_;
  sourcemapper = sourcemapper_;

  if (usePermanentListener) {
    logger.info('activating v8 breakpoint listener (permanent)');
    v8.setListener(handleDebugEvents);
  }

  /* -- Public Interface -- */

  singleton = {
    /**
     * @param {!Breakpoint} breakpoint Debug API Breakpoint object
     * @param {function(?Error)} cb callback with an options error string 1st
     *            argument
     */
    set: function(
        breakpoint: apiTypes.Breakpoint, cb: (err: Error|null) => void): void {
      if (!v8 || !breakpoint ||
          typeof breakpoint.id === 'undefined' ||  // 0 is a valid id
          !breakpoint.location || !breakpoint.location.path ||
          !breakpoint.location.line) {
        return setErrorStatusAndCallback(
            cb, breakpoint, StatusMessage.UNSPECIFIED,
            messages.INVALID_BREAKPOINT);
      }

      const baseScriptPath = path.normalize(breakpoint.location.path);
      if (!sourcemapper.hasMappingInfo(baseScriptPath)) {
        if (!_.endsWith(baseScriptPath, '.js')) {
          return setErrorStatusAndCallback(
              cb, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
              messages.COULD_NOT_FIND_OUTPUT_FILE);
        }

        setInternal(breakpoint, null /* mapInfo */, null /* compile */, cb);
      } else {
        const line = breakpoint.location.line;
        const column = 0;
        const mapInfo = sourcemapper.mappingInfo(baseScriptPath, line, column);

        const compile = getBreakpointCompiler(breakpoint);
        if (breakpoint.condition && compile) {
          try {
            breakpoint.condition = compile(breakpoint.condition);
          } catch (e) {
            logger.info(
                'Unable to compile condition >> ' + breakpoint.condition +
                ' <<');
            return setErrorStatusAndCallback(
                cb, breakpoint, StatusMessage.BREAKPOINT_CONDITION,
                messages.ERROR_COMPILING_CONDITION);
          }
        }

        setInternal(breakpoint, mapInfo, compile, cb);
      }
    },

    clear: function(
        breakpoint: apiTypes.Breakpoint, cb: (err: Error|null) => void): void {
      if (typeof breakpoint.id === 'undefined') {
        return setErrorStatusAndCallback(
            cb, breakpoint, StatusMessage.BREAKPOINT_CONDITION,
            messages.V8_BREAKPOINT_CLEAR_ERROR);
      }
      const breakpointData = breakpoints[breakpoint.id];
      if (!breakpointData) {
        return setErrorStatusAndCallback(
            cb, breakpoint, StatusMessage.BREAKPOINT_CONDITION,
            messages.V8_BREAKPOINT_CLEAR_ERROR);
      }
      const v8bp = breakpointData.v8Breakpoint;

      v8.clearBreakPoint(v8bp.number());
      delete breakpoints[breakpoint.id];
      delete listeners[v8bp.number()];
      numBreakpoints--;
      if (numBreakpoints === 0 && !usePermanentListener) {
        // removed last breakpoint
        logger.info('deactivating v8 breakpoint listener');
        v8.setListener(null);
      }
      return setImmediate(function() {
        cb(null);
      });
    },

    /**
     * @param {Breakpoint} breakpoint
     * @param {Function} callback
     */
    wait: function(
        breakpoint: apiTypes.Breakpoint,
        callback: (err?: Error) => void): void {
      // TODO: Address the case whree `breakpoint.id` is `null`.
      const num = breakpoints[breakpoint.id as string].v8Breakpoint.number();
      const listener =
          onBreakpointHit.bind(null, breakpoint, function(err: Error) {
            listeners[num].enabled = false;
            // This method is called from the debug event listener, which
            // swallows all exception. We defer the callback to make sure the
            // user errors aren't silenced.
            setImmediate(function() {
              callback(err);
            });
          });

      listeners[num] = {enabled: true, listener: listener};
    },

    /**
     * @param {Breakpoint} breakpoint
     * @param {Function} callback
     */
    log: function(
        breakpoint: apiTypes.Breakpoint,
        print: (format: string, exps: string[]) => void,
        shouldStop: () => boolean): void {
      // TODO: Address the case whree `breakpoint.id` is `null`.
      const num = breakpoints[breakpoint.id as string].v8Breakpoint.number();
      let logsThisSecond = 0;
      let timesliceEnd = Date.now() + 1000;
      // TODO: Determine why the Error argument is not used.
      const listener =
          onBreakpointHit.bind(null, breakpoint, function(_err: Error) {
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
              listeners[num].enabled = false;
            } else {
              if (logsThisSecond >= config.log.maxLogsPerSecond) {
                listeners[num].enabled = false;
                setTimeout(function() {
                  // listeners[num] may have been deleted by `clear` during the
                  // async hop. Make sure it is valid before setting a property
                  // on it.
                  if (!shouldStop() && listeners[num]) {
                    listeners[num].enabled = true;
                  }
                }, config.log.logDelaySeconds * 1000);
              }
            }
          });
      listeners[num] = {enabled: true, listener: listener};
    },

    // The following are for testing:
    messages: messages,
    numBreakpoints_: function(): number {
      return Object.keys(breakpoints).length;
    },
    numListeners_: function(): number {
      return Object.keys(listeners).length;
    }
  };

  /* -- Private Functions -- */

  /**
   * Internal breakpoint set function. At this point we have looked up source
   * maps (if necessary), and scriptPath happens to be a JavaScript path.
   *
   * @param {!Breakpoint} breakpoint Debug API Breakpoint object
   * @param {!string} scriptPath path to JavaScript source file
   * @param {function(string)=} compile optional compile function that can be
   *    be used to compile source expressions to JavaScript
   * @param {function(?Error)} cb error-back style callback
   */
  // TODO: Fix the documented types to match the function's input types
  function setInternal(
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
          return setErrorStatusAndCallback(
              cb, breakpoint, StatusMessage.BREAKPOINT_CONDITION,
              messages.DISALLOWED_EXPRESSION);
        }
      } catch (err) {
        const message = messages.SYNTAX_ERROR_IN_CONDITION + err.message;
        return setErrorStatusAndCallback(
            cb, breakpoint, StatusMessage.BREAKPOINT_CONDITION, message);
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
    const scripts = findScripts(
        mapInfo ? mapInfo.file :
                  path.normalize(
                      (breakpoint.location as apiTypes.SourceLocation).path),
        config, fileStats);
    if (scripts.length === 0) {
      return setErrorStatusAndCallback(
          cb, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
          messages.SOURCE_FILE_NOT_FOUND);
    } else if (scripts.length === 1) {
      // Found the script
      matchingScript = scripts[0];
    } else {
      return setErrorStatusAndCallback(
          cb, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
          messages.SOURCE_FILE_AMBIGUOUS);
    }

    // TODO: Address the case where `breakpoint.location` is `null`.
    // TODO: Address the case where `fileStats[matchingScript]` is `null`.
    if ((breakpoint.location as apiTypes.SourceLocation).line >=
        (fileStats[matchingScript] as FileStats).lines) {
      return setErrorStatusAndCallback(
          cb, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
          messages.INVALID_LINE_NUMBER + matchingScript + ':' +
              (breakpoint.location as apiTypes.SourceLocation).line +
              '. Loaded script contained ' +
              (fileStats[matchingScript] as FileStats).lines +
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
      column += MODULE_WRAP_PREFIX_LENGTH - 1;
    }

    const v8bp = setByRegExp(matchingScript, line, column);
    if (!v8bp) {
      return setErrorStatusAndCallback(
          cb, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
          messages.V8_BREAKPOINT_ERROR);
    }

    if (numBreakpoints === 0 && !usePermanentListener) {
      // added first breakpoint
      logger.info('activating v8 breakpoint listener');
      v8.setListener(handleDebugEvents);
    }

    // TODO: Address the case whree `breakpoint.id` is `null`.
    breakpoints[breakpoint.id as string] =
        // TODO: Address the case where `ast` is `null`.
        new BreakpointData(breakpoint, v8bp, ast as estree.Program, compile);
    numBreakpoints++;

    setImmediate(function() {
      cb(null);
    });  // success.
  }

  /**
   * Produces a compilation function based on the file extension of the
   * script path in which the breakpoint is set.
   *
   * @param {Breakpoint} breakpoint
   */
  function getBreakpointCompiler(breakpoint: apiTypes.Breakpoint):
      ((uncompiled: string) => string)|null {
    // TODO: Address the case where `breakpoint.location` is `null`.
    switch (
        path.normalize((breakpoint.location as apiTypes.SourceLocation).path)
            .split('.')
            .pop()) {
      case 'coffee':
        return function(uncompiled) {
          const comp = require('coffee-script');
          const compiled = comp.compile('0 || (' + uncompiled + ')');
          // Strip out coffeescript scoping wrapper to get translated condition
          const re =
              /\(function\(\) {\s*0 \|\| \((.*)\);\n\n\}\)\.call\(this\);/;
          const match = re.exec(compiled);
          if (match && match.length > 1) {
            return match[1].trim();
          } else {
            throw new Error('Compilation Error for: ' + uncompiled);
          }
        };
      case 'es6':
      case 'es':
      case 'jsx':
        return function(uncompiled) {
          // If we want to support es6 watch expressions we can compile them
          // here. Babel is a large dependency to have if we don't need it in
          // all cases.
          return uncompiled;
        };
      default:
        return null;
    }
  }

  function setByRegExp(
      scriptPath: string, line: number, column: number): v8Types.BreakPoint {
    const regexp = pathToRegExp(scriptPath);
    const num = v8.setScriptBreakPointByRegExp(regexp, line - 1, column - 1);
    const v8bp = v8.findBreakPoint(num);
    return v8bp;
  }

  // function setById(scriptPath, line) {
  //   const script = findScript(scriptPath);
  //   if (!script) {
  //     return null;
  //   }

  //   // v8 uses 0-based line numbers                     ----v
  //   const position = v8.findScriptSourcePosition(script, line - 1, 0);
  //   if (!position) {
  //     return null;
  //   }

  //   const v8bp = v8.setBreakPointByScriptIdAndPosition(
  //     script.id, position, null /* condition */, true /*enabled*/
  //   );
  //   if (!v8bp) {
  //     return null;
  //   }

  //   return v8bp;
  // }

  function onBreakpointHit(
      breakpoint: apiTypes.Breakpoint, callback: (err: Error|null) => void,
      execState: v8Types.ExecutionState): void {
    // TODO: Address the situation where `breakpoint.id` is `null`.
    const v8bp = breakpoints[breakpoint.id as string].v8Breakpoint;

    if (!v8bp.active()) {
      // Breakpoint exists, but not active. We never disable breakpoints, so
      // this is theoretically not possible. Perhaps this is possible if there
      // is a second debugger present? Regardless, report the error.
      return setErrorStatusAndCallback(
          callback, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
          messages.V8_BREAKPOINT_DISABLED);
    }

    const result = checkCondition(breakpoint, execState);
    if (result.error) {
      return setErrorStatusAndCallback(
          callback, breakpoint, StatusMessage.BREAKPOINT_CONDITION,
          messages.ERROR_EVALUATING_CONDITION + result.error);
    } else if (!result.value) {
      // Check again next time
      logger.info('\tthe breakpoint condition wasn\'t met');
      return;
    }

    // Breakpoint Hit
    const start = process.hrtime();
    try {
      captureBreakpointData(breakpoint, execState);
    } catch (err) {
      return setErrorStatusAndCallback(
          callback, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
          messages.CAPTURE_BREAKPOINT_DATA + err);
    }
    const end = process.hrtime(start);
    logger.info(formatInterval('capture time: ', end));
    callback(null);
  }

  /**
   * @param {Debug.DebugEvent} evt
   * @param {Debug#ExecutionState} execState
   * @param {Debug#BreakEvent} eventData
   */
  function handleDebugEvents(
      evt: v8Types.DebugEvent, execState: v8Types.ExecutionState,
      eventData: v8Types.BreakEvent): void {
    try {
      switch (evt) {
        // TODO: Address the case where `v8` is `null`.
        case v8.DebugEvent.Break:
          eventData.breakPointsHit().forEach(function(hit) {
            const num = hit.script_break_point().number();
            if (listeners[num].enabled) {
              logger.info('>>>V8 breakpoint hit<<< number: ' + num);
              listeners[num].listener(execState, eventData);
            }
          });
          break;
        default:
      }
    } catch (e) {
      logger.warn('Internal V8 error on breakpoint event: ' + e);
    }
  }

  function captureBreakpointData(
      breakpoint: apiTypes.Breakpoint,
      execState: v8Types.ExecutionState): void {
    const expressionErrors: Array<apiTypes.Variable|null> = [];
    // TODO: Address the case where `breakpoint.id` is `null`.
    if (breakpoint.expressions &&
        breakpoints[breakpoint.id as string].compile) {
      for (let i = 0; i < breakpoint.expressions.length; i++) {
        try {
          // TODO: Address the case where `breakpoint.id` is `null`.
          breakpoint.expressions[i] =
              // TODO: Address the case where `compile` is `null`.
              (breakpoints[breakpoint.id as string].compile as (text: string) =>
                   string)(breakpoint.expressions[i]);
        } catch (e) {
          logger.info(
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
          execState, breakpoint.expressions as string[], config, v8);
      if (breakpoint.location && captured.location && captured.location.line)
        breakpoint.location.line = captured.location.line + 1;
      breakpoint.stackFrames = captured.stackFrames;
      // TODO: This suggests the Status type and Variable type are the same.
      //       Determine if that is the case.
      breakpoint.variableTable = captured.variableTable as apiTypes.Variable[];
      breakpoint.evaluatedExpressions =
          expressionErrors.concat(captured.evaluatedExpressions);
    }
  }

  /**
   * Evaluates the breakpoint condition, if present.
   * @return object with either a boolean value or an error property
   */
  function checkCondition(
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

  function setErrorStatusAndCallback(
      fn: (err: Error|null) => void, breakpoint: apiTypes.Breakpoint,
      refersTo: apiTypes.Reference, message: string): void {
    const error = new Error(message);
    return setImmediate(function() {
      if (breakpoint && !breakpoint.status) {
        breakpoint.status = new StatusMessage(refersTo, message, true);
      }
      fn(error);
    });
  }

  return singleton;
}

/**
 * @param {!string} scriptPath path of a script
 */
function pathToRegExp(scriptPath: string): RegExp {
  // make sure the script path starts with a slash. This makes sure our
  // regexp doesn't match monkey.js when the user asks to set a breakpoint
  // in key.js
  if (path.sep === '/' || scriptPath.indexOf(':') === -1) {
    scriptPath = path.join(path.sep, scriptPath);
  }
  if (path.sep !== '/') {
    scriptPath = scriptPath.replace(new RegExp('\\\\', 'g'), '\\\\');
  }
  // Escape '.' characters.
  scriptPath = scriptPath.replace('.', '\\.');
  return new RegExp(scriptPath + '$');
}

// Exposed for unit testing.
export function findScripts(
    scriptPath: string, config: DebugAgentConfig,
    fileStats: ScanStats): string[] {
  // Use repository relative mapping if present.
  if (config.appPathRelativeToRepository) {
    const candidate = scriptPath.replace(
        // TODO: Address the case where `config.workingDirectory` is `null`.
        config.appPathRelativeToRepository, config.workingDirectory as string);
    // There should be no ambiguity resolution if project root is provided.
    return fileStats[candidate] ? [candidate] : [];
  }
  const regexp = pathToRegExp(scriptPath);
  // Next try to match path.
  const matches = Object.keys(fileStats).filter(regexp.test.bind(regexp));
  if (matches.length === 1) {
    return matches;
  }

  // Finally look for files with the same name regardless of path.
  return findScriptsFuzzy(scriptPath, Object.keys(fileStats));
}

/**
 * Given an list of available files and a script path to match, this function
 * tries to resolve the script to a (hopefully unique) match in the file list
 * disregarding the full path to the script. This can be useful because repo
 * file paths (that the UI has) may not necessarily be suffixes of the absolute
 * paths of the deployed files. This happens when the user deploys a
 * subdirectory of the repo.
 *
 * For example consider a file named `a/b.js` in the repo. If the
 * directory contents of `a` are deployed rather than the whole repo, we are not
 * going to have any file named `a/b.js` in the running Node process.
 *
 * We incrementally consider more components of the path until we find a unique
 * match, or return all the potential matches.
 *
 * @example findScriptsFuzzy('a/b.js', ['/d/b.js']) // -> ['/d/b.js']
 * @example findScriptsFuzzy('a/b.js', ['/c/b.js', '/d/b.js']); // -> []
 * @example findScriptsFuzzy('a/b.js', ['/x/a/b.js', '/y/a/b.js'])
 *                 // -> ['x/a/b.js', 'y/a/b.js']
 *
 * @param {string} scriptPath partial path to the script.
 * @param {array<string>} fileList an array of absolute paths of filenames
 *     available.
 * @return {array<string>} list of files that match.
 */
export function findScriptsFuzzy(
    scriptPath: string, fileList: string[]): string[] {
  let matches = fileList;
  const components = scriptPath.split(path.sep);
  for (let i = components.length - 1; i >= 0; i--) {
    const regexp = pathToRegExp(components.slice(i).join(path.sep));
    matches = matches.filter(regexp.test.bind(regexp));
    if (matches.length <= 1) {
      break;  // Either no matches, or we found a unique match.
    }
  }
  return matches;
}
