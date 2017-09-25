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

interface DebugApiConstructor {
  new(logger_: Logger, config_: DebugAgentConfig, jsFiles_: ScanStats,
      sourcemapper_: SourceMapper): DebugApi;
}

class DummyDebugApi implements DebugApi {
  constructor(
      _logger: Logger, _config: DebugAgentConfig, _jsFiles: ScanStats,
      _sourcemapper: SourceMapper) {
    return;
  }
  set(_breakpoint: apiTypes.Breakpoint, cb: (err: Error|null) => void): void {
    return setImmediate(() => {
      cb(new Error('no debugapi running.'));
    });
  }
  clear(_breakpoint: apiTypes.Breakpoint, cb: (err: Error|null) => void): void {
    return setImmediate(() => {
      cb(new Error('no debugapi running.'));
    });
  }
  wait(_breakpoint: apiTypes.Breakpoint, cb: (err?: Error) => void): void {
    return setImmediate(() => {
      cb(new Error('no debugapi running.'));
    });
  }
  log:
      (breakpoint: apiTypes.Breakpoint,
       print: (format: string, exps: string[]) => void,
       shouldStop: () => boolean) => void;
  disconnect: () => void;
  numBreakpoints_: () => number;
  numListeners_: () => number;
}

let debugApiConstructor: DebugApiConstructor;
const nodeVersion = /v(\d+\.\d+\.\d+)/.exec(process.version);

if (!nodeVersion || nodeVersion.length < 2) {
  console.error(
      'Debug agent cannot get node version. Cloud debugger is disabled.');
  debugApiConstructor = DummyDebugApi;
} else if (semver.satisfies(nodeVersion[1], '>=8')) {
  const inspectorapi = require('./inspectordebugapi');
  debugApiConstructor = inspectorapi.InspectorDebugApi;
} else {
  const v8debugapi = require('./v8debugapi');
  debugApiConstructor = v8debugapi.V8DebugApi;
}

export const MODULE_WRAP_PREFIX_LENGTH =
    require('module').wrap('☃').indexOf('☃');

let singleton: DebugApi;

export function create(
    logger: Logger, config: DebugAgentConfig, jsFiles: ScanStats,
    sourcemapper: SourceMapper): DebugApi|null {
  if (singleton && !config.forceNewAgent_) {
    return singleton;
  } else if (singleton) {
    singleton.disconnect();
  }

  singleton = new debugApiConstructor(logger, config, jsFiles, sourcemapper);
  return singleton;
}
