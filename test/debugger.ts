// Copyright 2016 Google LLC
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
 * @module debug/debugger
 */

import {Debuggee} from '../src/debuggee';
import * as stackdriver from '../src/types/stackdriver';

// TODO: Write a Debugger interface that works with the Firebase backend.


export class Debugger {

  /**
   * @constructor
   */
  constructor() {
  }

  /**
   * Gets a list of debuggees in a given project to which the user can set
   * breakpoints.
   * @param {string} projectId - The project ID for the project whose debuggees
   *     should be listed.
   * @param {boolean=} includeInactive - Whether or not to include inactive
   *     debuggees in the list (default false).
   */
  async listDebuggees(projectId: string, includeInactive: boolean) {
  }

  /**
   * Gets a list of breakpoints in a given debuggee.
   * @param {string} debuggeeId - The ID of the debuggee whose breakpoints should
   *     be listed.
   * @param {object=} options - An object containing options on the list of
   *     breakpoints.
   * @param {boolean=} options.includeAllUsers - If set to true, include
   *     breakpoints set by all users, or just by the caller (default false).
   * @param {boolean=} options.includeInactive - Whether or not to include
   *     inactive breakpoints in the list (default false).
   * @param {Action=} options.action - Either 'CAPTURE' or 'LOG'. If specified,
   *     only breakpoints with a matching action will be part of the list.
   */
  listBreakpoints(
    debuggeeId: string,
    options: {
      includeAllUsers?: boolean;
      includeInactive?: boolean;
      action?: stackdriver.Action;
    }
  ) {
  }

  /**
   * Gets information about a given breakpoint.
   * @param {string} debuggee - The ID of the debuggee in which the breakpoint
   *     is set.
   * @param {string} breakpointId - The ID of the breakpoint to get information
   *     about.
   */
  getBreakpoint(debuggeeId: string, breakpointId: string) {
  }

  /**
   * Sets a new breakpoint.
   * @param {Debuggee} debuggeeId - The ID of the debuggee in which the breakpoint
   *     should be set.
   * @param {Breakpoint} breakpoint - An object representing information about
   *     the breakpoint to set.
   */
  setBreakpoint(debuggeeId: string, breakpoint: stackdriver.Breakpoint) {
  }

  /**
   * Deletes a breakpoint.
   * @param {Debuggee} debuggeeId - The ID of the debuggee to which the breakpoint
   *     belongs.
   * @param {Breakpoint} breakpointId - The ID of the breakpoint to delete.
   */
  deleteBreakpoint(debuggeeId: string, breakpointId: string) {
  }
}
