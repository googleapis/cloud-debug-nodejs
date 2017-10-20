/**
 * Copyright 2016 Google Inc. All Rights Reserved.
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

/*!
 * @module debug/debugger
 */

import {Debug} from '../src/client/stackdriver/debug';
import {Debuggee} from '../src/debuggee';
import * as commonTypes from '../src/types/common';
import * as stackdriver from '../src/types/stackdriver';

export const common: commonTypes.Common = require('@google-cloud/common');
// TODO: Verify these types are correct.
const qs: {
  parse: (qs: any, sep?: string, eq?: string, options?: {maxKeys?: number}) =>
      any,
  stringify:
      (obj: object|string|boolean|number, sep?: string, eq?: string,
       name?: string) => string
} = require('querystring');

/** @const {string} Cloud Debug API endpoint */
const API = 'https://clouddebugger.googleapis.com/v2/debugger';

export class Debugger extends common.ServiceObject {
  private nextWaitToken: string|null;
  private clientVersion: string;

  /**
   * @constructor
   */
  constructor(debug: Debug) {
    super({parent: debug, baseUrl: '/debugger'});

    /** @private {string} */
    this.nextWaitToken = null;

    this.clientVersion = debug.packageInfo.name + '/client-for-testing/v' + debug.packageInfo.version;
  }

  /**
   * Gets a list of debuggees in a given project to which the user can set
   * breakpoints.
   * @param {string} projectId - The project ID for the project whose debuggees
   *     should be listed.
   * @param {boolean=} includeInactive - Whether or not to include inactive
   *     debuggees in the list (default false).
   * @param {!function(?Error,Debuggee[]=)} callback - A function that will be
   *     called with a list of Debuggee objects as a parameter, or an Error
   * object if an error occurred in obtaining it.
   */
  listDebuggees(
      projectId: string, includeInactive: boolean,
      callback: (err: Error|null, debuggees?: Debuggee[]) => void) {
    if (typeof (includeInactive) === 'function') {
      callback = includeInactive;
      includeInactive = false;
    }

    const query = {
      clientVersion: this.clientVersion,
      includeInactive: includeInactive,
      project: projectId
    };

    const uri = API + '/debuggees?' + qs.stringify(query);
    this.request({uri: uri, json: true}, function(err, body, response) {
      if (err) {
        callback(err);
      } else if (!response) {
        callback(new Error('unknown error - request response missing'));
      } else if (response.statusCode !== 200) {
        callback(new Error(
            'unable to list debuggees, status code ' + response.statusCode));
      } else if (!body) {
        callback(new Error('invalid response body from server'));
      } else {
        if (body.debuggees) {
          callback(null, body.debuggees);
        } else {
          callback(null, []);
        }
      }
    });
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
   * @param {boolean=} options.stripResults - If set to true, breakpoints will be
   *     stripped of the following fields: stackFrames, evaluatedExpressions,
   *     and variableTable (default false).
   * @param {string=} options.action - Either 'CAPTURE' or 'LOG'. If specified,
   *     only breakpoints with a matching action will be part of the list.
   * @param {!function(?Error,Breakpoint[]=)} callback - A function that will be
   *     called with a list of Breakpoint objects as a parameter, or an Error
   *     object if an error occurred in obtaining it.
   */
  listBreakpoints(
      debuggeeId: string, options: {
        includeAllUsers: boolean; includeInactive: boolean;
        stripResults: boolean;
        actions: string
      },
      callback:
          (err: Error|null, breakpoints?: stackdriver.Breakpoint[]) => void) {
    if (typeof (options) === 'function') {
      callback = options;
      // TODO: Determine how to remove this cast.
      options = {} as any;
    }

    // TODO: Remove this cast as `any`
    const query: any = {
      clientVersion: this.clientVersion,
      includeAllUsers: !!options.includeAllUsers,
      includeInactive: !!options.includeInactive,
      stripResults: !!options.stripResults
    };
    // TODO: Determine how to remove this cast.
    if ((options as any).action) {
      query.action = {value: (options as any).action};
    }
    if (this.nextWaitToken) {
      query.waitToken = this.nextWaitToken;
    }

    const uri = API + '/debuggees/' + encodeURIComponent(debuggeeId) +
        '/breakpoints?' + qs.stringify(query);
    this.request({uri: uri, json: true}, function(err, body, response) {
      if (err) {
        callback(err);
      } else if (!response) {
        callback(new Error('unknown error - request response missing'));
      } else if (response.statusCode !== 200) {
        callback(new Error(
            'unable to list breakpoints, status code ' + response.statusCode));
      } else if (!body) {
        callback(new Error('invalid response body from server'));
      } else {
        if (body.breakpoints) {
          callback(null, body.breakpoints);
        } else {
          callback(null, []);
        }
      }
    });
  }

  /**
   * Gets information about a given breakpoint.
   * @param {string} debuggee - The ID of the debuggee in which the breakpoint
   *     is set.
   * @param {string} breakpointId - The ID of the breakpoint to get information
   *     about.
   * @param {!function(?Error,Breakpoint=)} callback - A function that will be
   *     called with information about the given breakpoint, or an Error object
   *     if an error occurred in obtaining its information.
   */
  getBreakpoint(
      debuggeeId: string, breakpointId: string,
      callback: (err: Error|null, bp?: stackdriver.Breakpoint) => void) {
    const query = {clientVersion: this.clientVersion};

    const uri = API + '/debuggees/' + encodeURIComponent(debuggeeId) +
        '/breakpoints/' + encodeURIComponent(breakpointId) + '?' +
        qs.stringify(query);
    this.request({uri: uri, json: true}, function(err, body, response) {
      if (err) {
        callback(err);
      } else if (!response) {
        callback(new Error('unknown error - request response missing'));
      } else if (response.statusCode !== 200) {
        callback(new Error(
            'unable to get breakpoint info, status code ' +
            response.statusCode));
      } else if (!body || !body.breakpoint) {
        callback(new Error('invalid response body from server'));
      } else {
        callback(null, body.breakpoint);
      }
    });
  }

  /**
   * Sets a new breakpoint.
   * @param {Debuggee} debuggeeId - The ID of the debuggee in which the breakpoint
   *     should be set.
   * @param {Breakpoint} breakpoint - An object representing information about
   *     the breakpoint to set.
   * @param {!function(?Error,Breakpoint=)} callback - A function that will be
   *     called with information about the breakpoint that was just set, or an
   *     Error object if an error occurred in obtaining its information. Note
   *     that the Breakpoint object here will differ from the input object in
   *     that its id field will be set.
   */
  setBreakpoint(
      debuggeeId: string, breakpoint: stackdriver.Breakpoint,
      callback: (err: Error|null, bp?: stackdriver.Breakpoint) => void) {
    const query = {clientVersion: this.clientVersion};
    const options = {
      uri: API + '/debuggees/' + encodeURIComponent(debuggeeId) +
          '/breakpoints/set?' + qs.stringify(query),
      method: 'POST',
      json: true,
      body: breakpoint
    };

    this.request(options, function(err, body, response) {
      if (err) {
        callback(err);
      } else if (!response) {
        callback(new Error('unknown error - request response missing'));
      } else if (response.statusCode !== 200) {
        callback(new Error(
            'unable to set breakpoint, status code ' + response.statusCode));
      } else if (!body || !body.breakpoint) {
        callback(new Error('invalid response body from server'));
      } else {
        callback(null, body.breakpoint);
      }
    });
  }

  /**
   * Deletes a breakpoint.
   * @param {Debuggee} debuggeeId - The ID of the debuggee to which the breakpoint
   *     belongs.
   * @param {Breakpoint} breakpointId - The ID of the breakpoint to delete.
   * @param {!function(?Error)} callback - A function that will be
   *     called with a Error object as a parameter if an error occurred in
   *     deleting a breakpoint. If no error occurred, the first argument will be
   *     set to null.
   */
  deleteBreakpoint(
      debuggeeId: string, breakpointId: string,
      callback: (err: Error|null) => void) {
    const query = {clientVersion: this.clientVersion};
    const options = {
      uri: API + '/debuggees/' + encodeURIComponent(debuggeeId) +
          '/breakpoints/' + encodeURIComponent(breakpointId) + '?' +
          qs.stringify(query),
      method: 'DELETE',
      json: true
    };

    this.request(options, function(err, body, response) {
      if (err) {
        callback(err);
      } else if (!response) {
        callback(new Error('unknown error - request response missing'));
      } else if (response.statusCode !== 200) {
        callback(new Error(
            'unable to delete breakpoint, status code ' + response.statusCode));
      } else if (Object.keys(body).length > 0) {
        callback(new Error('response body is non-empty'));
      } else {
        callback(null);
      }
    });
  }
}
