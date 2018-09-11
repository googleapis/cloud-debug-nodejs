/**
 * Copyright 2018 Google LLC
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

import consoleLogLevel = require('console-log-level');

export type Arguments = string[];
export interface Call {
  type: 'trace'|'debug'|'info'|'warn'|'error'|'fatal';
  args: Arguments;
}

export class MockLogger implements consoleLogLevel.Logger {
  traces: Call[] = [];
  debugs: Call[] = [];
  infos: Call[] = [];
  warns: Call[] = [];
  errors: Call[] = [];
  fatals: Call[] = [];

  allCalls() {
    return this.traces.concat(
        this.debugs, this.infos, this.warns, this.errors, this.fatals);
  }

  trace(...args: Arguments) {
    this.traces.push({type: 'trace', args});
  }

  debug(...args: Arguments) {
    this.debugs.push({type: 'debug', args});
  }

  info(...args: Arguments) {
    this.infos.push({type: 'info', args});
  }

  warn(...args: Arguments) {
    this.warns.push({type: 'warn', args});
  }

  error(...args: Arguments) {
    this.errors.push({type: 'error', args});
  }

  fatal(...args: Arguments) {
    this.fatals.push({type: 'fatal', args});
  }
}
