/**
 * Copyright 2014, 2015 Google Inc. All Rights Reserved.
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
 * @module debug/controller
 */

import {ServiceObject} from '@google-cloud/common';
import * as assert from 'assert';
import * as qs from 'querystring';
import * as request from 'request';  // Only for type declarations.
import {teenyRequest} from 'teeny-request';

import {URL} from 'url';

import {Debug} from '../client/stackdriver/debug';
import {Debuggee} from '../debuggee';
import * as stackdriver from '../types/stackdriver';

/** @const {string} Cloud Debug API endpoint */
const API = 'https://clouddebugger.googleapis.com/v2/controller';

export class Controller extends ServiceObject {
  private nextWaitToken: string|null;

  apiUrl: string;

  /**
   * @constructor
   */

  constructor(debug: Debug, config?: {apiUrl?: string}) {
    super({
      requestModule: teenyRequest as typeof request,
      parent: debug,
      baseUrl: '/controller'
    });

    /** @private {string} */
    this.nextWaitToken = null;

    this.apiUrl = API;

    if (config && config.apiUrl) {
      this.apiUrl = config.apiUrl + new URL(API).pathname;
    }
  }

  /**
   * Register to the API (implementation)
   *
   * @param {!function(?Error,Object=)} callback
   * @private
   */
  register(debuggee: Debuggee, callback: (err: Error|null, result?: {
                                 debuggee: Debuggee
                               }) => void): void {
    const options = {
      uri: this.apiUrl + '/debuggees/register',
      method: 'POST',
      json: true,
      body: {debuggee}
    };
    this.request(options, (err, body: {debuggee: Debuggee}, response) => {
      if (err) {
        callback(err);
      } else if (response!.statusCode !== 200) {
        callback(new Error(
            'unable to register, statusCode ' + response!.statusCode));
      } else if (!body.debuggee) {
        callback(new Error('invalid response body from server'));
      } else {
        debuggee.id = body.debuggee.id;
        callback(null, body);
      }
    });
  }


  /**
   * Fetch the list of breakpoints from the server. Assumes we have registered.
   * @param {!function(?Error,Object=,Object=)} callback accepting (err, response,
   * body)
   */
  listBreakpoints(
      debuggee: Debuggee,
      callback:
          (err: Error|null, response?: request.Response,
           body?: stackdriver.ListBreakpointsResponse) => void): void {
    const that = this;
    assert(debuggee.id, 'should have a registered debuggee');
    const query: stackdriver.ListBreakpointsQuery = {successOnTimeout: true};
    if (that.nextWaitToken) {
      query.waitToken = that.nextWaitToken;
    }

    const uri = this.apiUrl + '/debuggees/' + encodeURIComponent(debuggee.id) +
        '/breakpoints?' + qs.stringify(query);
    that.request(
        {uri, json: true},
        (err, body: stackdriver.ListBreakpointsResponse, response) => {
          if (!response) {
            callback(
                err || new Error('unknown error - request response missing'));
            return;
          } else if (response.statusCode === 404) {
            // The v2 API returns 404 (google.rpc.Code.NOT_FOUND) when the agent
            // registration expires. We should re-register.
            callback(null, response);
            return;
          } else if (response.statusCode !== 200) {
            callback(new Error(
                'unable to list breakpoints, status code ' +
                response.statusCode));
            return;
          } else {
            body = body || {};
            that.nextWaitToken = body.nextWaitToken;
            callback(null, response, body);
          }
        });
  }

  /**
   * Update the server about breakpoint state
   * @param {!Debuggee} debuggee
   * @param {!Breakpoint} breakpoint
   * @param {!Function} callback accepting (err, body)
   */
  updateBreakpoint(
      debuggee: Debuggee, breakpoint: stackdriver.Breakpoint,
      callback: (err?: Error, body?: {}) => void): void {
    assert(debuggee.id, 'should have a registered debuggee');

    breakpoint.action = 'CAPTURE';
    breakpoint.isFinalState = true;
    const options = {
      uri: this.apiUrl + '/debuggees/' + encodeURIComponent(debuggee.id) +
          // TODO: Address the case where `breakpoint.id` is `undefined`.
          '/breakpoints/' + encodeURIComponent(breakpoint.id as string),
      json: true,
      method: 'PUT',
      body: {debuggeeId: debuggee.id, breakpoint}
    };

    // We need to have a try/catch here because a JSON.stringify will be done
    // by request. Some V8 debug mirror objects get a throw when we attempt to
    // stringify them. The try-catch keeps it resilient and avoids crashing the
    // user's app.
    try {
      this.request(options, (err, body /*, response */) => {
        callback(err!, body);
      });
    } catch (error) {
      callback(error);
    }
  }
}
