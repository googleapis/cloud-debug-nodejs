import {SourceMapper} from './sourcemapper';
import {DebugAgentConfig} from './config';
import {ScanStats} from './scanner';
import {V8DebugApi} from './v8debugapi2';

import * as apiTypes from '../types/api-types';
import {Logger} from '../types/common-types';


export interface DebugApi {
  sourcemapper: SourceMapper;
  set: (breakpoint: apiTypes.Breakpoint, cb: (err: Error|null) => void) => void;
  numBreakpoints_: () => number;
  numListeners_: () => number;
}

export const messages = {
  INVALID_BREAKPOINT: 'invalid snapshot - id or location missing',
  SOURCE_FILE_NOT_FOUND:
      'A script matching the source file was not found loaded on the debuggee',
  SOURCE_FILE_AMBIGUOUS: 'Multiple files match the path specified',
  V8_BREAKPOINT_ERROR: 'Unable to set breakpoint in v8',
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

export const MODULE_WRAP_PREFIX_LENGTH = require('module').wrap('☃').indexOf('☃');

let singleton: DebugApi;

export function create(
    logger_: Logger, config_: DebugAgentConfig, jsFiles_: ScanStats,
    sourcemapper_: SourceMapper): DebugApi|null {
  if (singleton && !config_.forceNewAgent_) {
    return singleton;
  }
  singleton = new V8DebugApi(logger_, config_, jsFiles_, sourcemapper_)
  return singleton;
}
