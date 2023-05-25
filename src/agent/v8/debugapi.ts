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

import consoleLogLevel = require('console-log-level');
import * as stackdriver from '../../types/stackdriver';
import {ResolvedDebugAgentConfig} from '../config';
import {ScanStats} from '../io/scanner';
import {SourceMapper} from '../io/sourcemapper';
import {InspectorDebugApi} from './inspector-debugapi';

export interface DebugApi {
  set(
    breakpoint: stackdriver.Breakpoint,
    cb: (err: Error | null) => void
  ): void;
  clear(
    breakpoint: stackdriver.Breakpoint,
    cb: (err: Error | null) => void
  ): void;
  wait(
    breakpoint: stackdriver.Breakpoint,
    callback: (err?: Error) => void
  ): void;
  log(
    breakpoint: stackdriver.Breakpoint,
    print: (format: string, exps: string[]) => void,
    shouldStop: () => boolean
  ): void;
  disconnect(): void;
  numBreakpoints_(): number;
  numListeners_(): number;
}

export const MODULE_WRAP_PREFIX_LENGTH = require('module')
  .wrap('☃')
  .indexOf('☃');

let singleton: DebugApi;

export function create(
  logger: consoleLogLevel.Logger,
  config: ResolvedDebugAgentConfig,
  jsFiles: ScanStats,
  sourcemapper: SourceMapper
): DebugApi {
  if (singleton && !config.forceNewAgent_) {
    return singleton;
  } else if (singleton) {
    singleton.disconnect();
  }

  singleton = new InspectorDebugApi(logger, config, jsFiles, sourcemapper);
  return singleton;
}
