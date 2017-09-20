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
import * as semver from 'semver';

import * as apiTypes from '../types/api-types';
import {Logger} from '../types/common-types';

import {DebugAgentConfig} from './config';
import {ScanStats} from './scanner';
import {SourceMapper} from './sourcemapper';

interface DebugApiConstructor {
  new(logger_: Logger, config_: DebugAgentConfig, jsFiles_: ScanStats,
      sourcemapper_: SourceMapper): DebugApi;
}
let debugApiConstructor: DebugApiConstructor;
let nodeVersion = /v(\d+\.\d+\.\d+)/.exec(process.version);
if (!nodeVersion || nodeVersion.length < 2) {
  console.error('can\'t get the node version.');
  process.exit(1);
} else if (semver.satisfies(nodeVersion[1], '>=8')) {
  const inspectorapi = require('./inspectordebugapi');
  debugApiConstructor = inspectorapi.InspectorDebugApi;
} else {
  const v8debugapi = require('./v8debugapi');
  debugApiConstructor = v8debugapi.V8DebugApi;
}

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
  if (singleton && !config_.forceNewAgent_) {
    return singleton;
  } else if (singleton) {
    singleton.disconnect();
  }

  let debugapi: any;
  debugapi = new debugApiConstructor(logger_, config_, jsFiles_, sourcemapper_);

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
