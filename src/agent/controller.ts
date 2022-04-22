// Copyright 2014 Google LLC
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

/*!
 * @module debug/controller
 */

import * as t from 'teeny-request';

import {Debuggee} from '../debuggee';
import * as stackdriver from '../types/stackdriver';

export interface Controller {

  /**
   * Register to the API (implementation)
   *
   * @param {!function(?Error,Object=)} callback
   */
  register(
    debuggee: Debuggee,
    callback: (
      err: Error | null,
      result?: {
        debuggee: Debuggee;
        agentId: string;
      }
    ) => void
  ): void;

  /**
   * Update the server about breakpoint state
   * @param {!Debuggee} debuggee
   * @param {!Breakpoint} breakpoint
   * @param {!Function} callback accepting (err, body)
   */
  updateBreakpoint(
    debuggee: Debuggee,
    breakpoint: stackdriver.Breakpoint,
    callback: (err?: Error, body?: {}) => void
  ): void;

  /**
   * Start listening to breakpoints updates.  The callback will be called when
   * there is an unrecoverable error or when the set of active breakpoints has changed.
   * @param {!Debuggee} debuggee 
   * @param {!function(?Error,Object=)} callback  accepting (err, breakpoints)
   */
  subscribeToBreakpoints(
    debuggee: Debuggee,
    callback: (
      err: Error | null,
      breakpoints: stackdriver.Breakpoint[]
    ) => void
  ): void;

  /**
   * Stops the Controller. This is for testing purposes only.
   */
  stop(): void;
}
