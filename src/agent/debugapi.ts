import * as apiTypes from '../types/api-types';
import {Logger} from '../types/common-types';

import {DebugAgentConfig} from './config';
import {ScanStats} from './scanner';
import {SourceMapper} from './sourcemapper';
import {V8DebugApi} from './v8debugapi2';

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
  numBreakpoints_: () => number;
  numListeners_: () => number;
}

export const MODULE_WRAP_PREFIX_LENGTH =
    require('module').wrap('☃').indexOf('☃');

let singleton: DebugApi;

export function create(
    logger_: Logger, config_: DebugAgentConfig, jsFiles_: ScanStats,
    sourcemapper_: SourceMapper): DebugApi|null {
  if (singleton && !config_.forceNewAgent_) {
    return singleton;
  }
  let v8debugapi = new V8DebugApi(logger_, config_, jsFiles_, sourcemapper_);
  singleton = {
    /**
     * @param {!Breakpoint} breakpoint Debug API Breakpoint object
     * @param {function(?Error)} cb callback with an options error string 1st
     *            argument
     */
    set: function(
        breakpoint: apiTypes.Breakpoint, cb: (err: Error|null) => void): void {
      v8debugapi.set(breakpoint, cb);
    },
    clear: function(
        breakpoint: apiTypes.Breakpoint, cb: (err: Error|null) => void): void {
      v8debugapi.clear(breakpoint, cb);
    },
    wait: function(breakpoint: apiTypes.Breakpoint, cb: (err?: Error) => void):
        void {
      v8debugapi.wait(breakpoint, cb);
    },

    log: function(
        breakpoint: apiTypes.Breakpoint,
        print: (format: string, exps: string[]) => void,
        shouldStop: () => boolean): void {
      v8debugapi.log(breakpoint, print,shouldStop);
    },
    numBreakpoints_: function(): number {
      return v8debugapi.numBreakpoints_();
    },
    numListeners_: function(): number {
      return v8debugapi.numListeners_();
    },
  };
  return singleton;
}
