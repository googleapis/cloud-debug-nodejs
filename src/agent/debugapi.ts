import * as semver from 'semver';

import * as apiTypes from '../types/api-types';
import {Logger} from '../types/common-types';

import {DebugAgentConfig} from './config';
import {InspectorDebugApi} from './inspectordebugapi';
import {ScanStats} from './scanner';
import {SourceMapper} from './sourcemapper';
import {V8DebugApi} from './v8debugapi2';

export const messages = {
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

export interface DebugApi {
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
  disconnect: () => void;
  numBreakpoints_: () => number;
  numListeners_: () => number;
}

export const MODULE_WRAP_PREFIX_LENGTH =
    require('module').wrap('☃').indexOf('☃');

let singleton: DebugApi;

export function create(
    logger_: Logger, config_: DebugAgentConfig, jsFiles_: ScanStats,
    sourcemapper_: SourceMapper): DebugApi|null {
  let nodeVersion = /v(\d+\.\d+\.\d+)/.exec(process.version);
  if (!nodeVersion || nodeVersion.length < 2) {
    return null;
  }

  if (singleton && !config_.forceNewAgent_) {
    return singleton;
  } else if (singleton) {
    singleton.disconnect();
  }
  let debugapi: any;
  if (semver.satisfies(nodeVersion[1], '>=8')) {
    // using inspector api
    debugapi = new InspectorDebugApi(logger_, config_, jsFiles_, sourcemapper_);
  } else {
    debugapi = new V8DebugApi(logger_, config_, jsFiles_, sourcemapper_);
  }
  singleton = {
    /**
     * @param {!Breakpoint} breakpoint Debug API Breakpoint object
     * @param {function(?Error)} cb callback with an options error string 1st
     *            argument
     */
    set: function(
        breakpoint: apiTypes.Breakpoint, cb: (err: Error|null) => void): void {
      debugapi.set(breakpoint, cb);
    },
    clear: function(
        breakpoint: apiTypes.Breakpoint, cb: (err: Error|null) => void): void {
      debugapi.clear(breakpoint, cb);
    },
    wait: function(breakpoint: apiTypes.Breakpoint, cb: (err?: Error) => void):
        void {
          debugapi.wait(breakpoint, cb);
        },

    log: function(
        breakpoint: apiTypes.Breakpoint,
        print: (format: string, exps: string[]) => void,
        shouldStop: () => boolean): void {
      debugapi.log(breakpoint, print, shouldStop);
    },
    disconnect: function() {
      debugapi.disconnect();
    },
    numBreakpoints_: function(): number {
      return debugapi.numBreakpoints_();
    },
    numListeners_: function(): number {
      return debugapi.numListeners_();
    },
  };
  return singleton;
}
