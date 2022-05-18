// Copyright 2022 Google LLC
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
 * @module debug/oneplatform-controller
 */

import {ServiceObject} from '@google-cloud/common';
import * as assert from 'assert';
import * as qs from 'querystring';
import * as t from 'teeny-request';

import {URL} from 'url';

import {Logger, ResolvedDebugAgentConfig} from './config';
import {Controller} from './controller';
import {StatusMessage} from '../client/stackdriver/status-message';
import {Debug} from '../client/stackdriver/debug';
import {Debuggee} from '../debuggee';
import * as stackdriver from '../types/stackdriver';

const BREAKPOINT_ACTION_MESSAGE =
  'The only currently supported breakpoint actions' + ' are CAPTURE and LOG.';

export class OnePlatformController extends ServiceObject implements Controller {
  private nextWaitToken: string | null;
  private agentId: string | null;
  private config: ResolvedDebugAgentConfig;
  private fetcherActive: boolean;
  private running: boolean;

  apiUrl: string;

  logger: Logger;

  /**
   * @constructor
   */
  constructor(debug: Debug, config: ResolvedDebugAgentConfig, logger: Logger) {
    super({parent: debug, baseUrl: '/controller'});

    /** @private {string} */
    this.nextWaitToken = null;
    this.agentId = null;

    this.apiUrl = `https://${debug.apiEndpoint}/v2/controller`;

    this.fetcherActive = false;
    this.running = true;

    /** @private */
    this.logger = logger;

    if (config && config.apiUrl) {
      this.apiUrl = config.apiUrl + new URL(this.apiUrl).pathname;
    }

    this.config = config;
  }

  /**
   * Register to the API (implementation)
   *
   * @param {!function(?Error,Object=)} callback
   * @private
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
  ): void {
    const options = {
      uri: this.apiUrl + '/debuggees/register',
      method: 'POST',
      json: true,
      body: {debuggee},
    };
    this.request(
      options,
      (err, body: {debuggee: Debuggee; agentId: string}, response) => {
        if (err) {
          callback(err);
        } else if (response!.statusCode !== 200) {
          callback(
            new Error('unable to register, statusCode ' + response!.statusCode)
          );
        } else if (!body.debuggee) {
          callback(new Error('invalid response body from server'));
        } else {
          debuggee.id = body.debuggee.id;
          this.agentId = body.agentId;
          callback(null, body);
        }
      }
    );
  }

  /**
   * Fetch the list of breakpoints from the server. Assumes we have registered.
   * @param {!function(?Error,Object=,Object=)} callback accepting (err, response,
   * body)
   */
  listBreakpoints(
    debuggee: Debuggee,
    callback: (
      err: Error | null,
      response?: t.Response,
      body?: stackdriver.ListBreakpointsResponse
    ) => void
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;
    assert(debuggee.id, 'should have a registered debuggee');
    const query: stackdriver.ListBreakpointsQuery = {successOnTimeout: true};
    if (that.nextWaitToken) {
      query.waitToken = that.nextWaitToken;
    }
    if (that.agentId) {
      query.agentId = that.agentId;
    }

    const uri =
      this.apiUrl +
      '/debuggees/' +
      encodeURIComponent(debuggee.id) +
      '/breakpoints?' +
      qs.stringify(query as qs.ParsedUrlQueryInput);
    that.request(
      {uri, json: true},
      (err, body: stackdriver.ListBreakpointsResponse, response) => {
        if (!response) {
          callback(
            err || new Error('unknown error - request response missing')
          );
          return;
        } else if (response.statusCode === 404) {
          // The v2 API returns 404 (google.rpc.Code.NOT_FOUND) when the agent
          // registration expires. We should re-register.
          callback(null, response as {} as t.Response);
          return;
        } else if (response.statusCode !== 200) {
          callback(
            new Error(
              'unable to list breakpoints, status code ' + response.statusCode
            )
          );
          return;
        } else {
          body = body || {};
          that.nextWaitToken = body.nextWaitToken;
          callback(null, response as {} as t.Response, body);
        }
      }
    );
  }

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
  ): void {
    assert(debuggee.id, 'should have a registered debuggee');

    breakpoint.action = 'CAPTURE';
    breakpoint.isFinalState = true;
    const options = {
      uri:
        this.apiUrl +
        '/debuggees/' +
        encodeURIComponent(debuggee.id) +
        // TODO: Address the case where `breakpoint.id` is `undefined`.
        '/breakpoints/' +
        encodeURIComponent(breakpoint.id as string),
      json: true,
      method: 'PUT',
      body: {debuggeeId: debuggee.id, breakpoint},
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
      callback(error as Error);
    }
  }

  subscribeToBreakpoints(
    debuggee: Debuggee,
    callback: (err: Error | null, breakpoints: stackdriver.Breakpoint[]) => void
  ): void {
    if (!this.fetcherActive) {
      this.scheduleBreakpointFetch_(debuggee, 0, false, callback);
    }
  }

  scheduleBreakpointFetch_(
    debuggee: Debuggee,
    seconds: number,
    once: boolean,
    callback: (err: Error | null, breakpoints: stackdriver.Breakpoint[]) => void
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;
    if (!once) {
      that.fetcherActive = true;
    }
    setTimeout(() => {
      if (!that.running) {
        return;
      }

      that.logger.info('Fetching breakpoints');
      if (!once) {
        that.fetcherActive = true;
      }
      // TODO: Address the case when `that.debuggee` is `null`.
      that.listBreakpoints(debuggee, (err, response, body) => {
        if (err) {
          that.logger.error(
            'Error fetching breakpoints – scheduling retry',
            err
          );
          // Return the error, prompting a re-registration.
          that.fetcherActive = false;
          callback(err, []);
          return;
        }
        switch (response!.statusCode) {
          case 404: {
            // Registration expired. Deactivate the fetcher and queue
            // re-registration, which will re-active breakpoint fetching.
            that.logger.info('\t404 Registration expired.');
            that.fetcherActive = false;
            const expiredError = new Error(response!.statusMessage);
            expiredError.name = 'RegistrationExpiredError';
            callback(expiredError, []);
            return;
          }

          default:
            // TODO: Address the case where `response` is `undefined`.
            that.logger.info('\t' + response!.statusCode + ' completed.');
            if (!body) {
              that.logger.error('\tinvalid list response: empty body');
              that.scheduleBreakpointFetch_(
                debuggee,
                that.config.breakpointUpdateIntervalSec,
                once,
                callback
              );
              return;
            }
            if (body.waitExpired) {
              that.logger.info('\tLong poll completed.');
              that.scheduleBreakpointFetch_(debuggee, 0, once, callback);
              return;
            }
            // eslint-disable-next-line no-case-declarations
            const bps = (body.breakpoints || []).filter(
              (bp: stackdriver.Breakpoint) => {
                const action = bp.action || 'CAPTURE';
                if (action !== 'CAPTURE' && action !== 'LOG') {
                  that.logger.warn(
                    'Found breakpoint with invalid action:',
                    action
                  );
                  bp.status = new StatusMessage(
                    StatusMessage.UNSPECIFIED,
                    BREAKPOINT_ACTION_MESSAGE,
                    true
                  );
                  that.updateBreakpoint(debuggee, bp, (err /*, body*/) => {
                    if (err) {
                      that.logger.error(
                        'Unable to complete breakpoint on server',
                        err
                      );
                    }
                  });
                  return false;
                }
                return true;
              }
            );
            callback(null, bps);
            that.scheduleBreakpointFetch_(
              debuggee,
              that.config.breakpointUpdateIntervalSec,
              once,
              callback
            );
        }
        return;
      });
    }, seconds * 1000).unref();
  }

  stop(): void {
    this.running = false;
  }
}
