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
 * @module debug/oneplatformcontroller
 */

import { ServiceObject } from '@google-cloud/common';
import * as assert from 'assert';
import * as consoleLogLevel from 'console-log-level';
import * as qs from 'querystring';
import * as t from 'teeny-request';

import { URL } from 'url';

import { Logger } from './config';
import { Controller } from './controller';
import { StatusMessage } from '../client/stackdriver/status-message';
import { Debug } from '../client/stackdriver/debug';
import { Debuggee } from '../debuggee';
import * as stackdriver from '../types/stackdriver';
import * as util from 'util';


// FIXME: Remove duplicated code!
const BREAKPOINT_ACTION_MESSAGE =
    'The only currently supported breakpoint actions' + ' are CAPTURE and LOG.';


/**
 * Formats a breakpoint object prefixed with a provided message as a string
 * intended for logging.
 * @param {string} msg The message that prefixes the formatted breakpoint.
 * @param {Breakpoint} breakpoint The breakpoint to format.
 * @return {string} A formatted string.
 */
const formatBreakpoint = (
    msg: string,
    breakpoint: stackdriver.Breakpoint
): string => {
    let text =
        msg +
        util.format(
            'breakpoint id: %s,\n\tlocation: %s',
            breakpoint.id,
            util.inspect(breakpoint.location)
        );
    if (breakpoint.createdTime) {
        const unixTime = Number(breakpoint.createdTime.seconds);
        const date = new Date(unixTime * 1000); // to milliseconds.
        text += '\n\tcreatedTime: ' + date.toString();
    }
    if (breakpoint.condition) {
        text += '\n\tcondition: ' + util.inspect(breakpoint.condition);
    }
    if (breakpoint.expressions) {
        text += '\n\texpressions: ' + util.inspect(breakpoint.expressions);
    }
    return text;
};

export class OnePlatformController extends ServiceObject implements Controller {
    private nextWaitToken: string | null;
    private agentId: string | null;

    apiUrl: string;

    logger: Logger;

    /**
     * @constructor
     */
    constructor(debug: Debug, config?: { apiUrl?: string }) {
        super({ parent: debug, baseUrl: '/controller' });

        /** @private {string} */
        this.nextWaitToken = null;
        this.agentId = null;

        this.apiUrl = `https://${debug.apiEndpoint}/v2/controller`;

        /** @private */
        this.logger = consoleLogLevel({
            stderr: true,
            prefix: 'Ugh.  Not really needed.',
            level: 'info',
        });


        if (config && config.apiUrl) {
            this.apiUrl = config.apiUrl + new URL(this.apiUrl).pathname;
        }
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
            body: { debuggee },
        };
        this.request(
            options,
            (err, body: { debuggee: Debuggee; agentId: string }, response) => {
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
        const query: stackdriver.ListBreakpointsQuery = { successOnTimeout: true };
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
            { uri, json: true },
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
            body: { debuggeeId: debuggee.id, breakpoint },
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

    subscribeToBreakpoints(
        debuggee: Debuggee,
        callback: (
            err: Error | null,
            breakpoints: stackdriver.Breakpoint[]
        ) => void
    ): void {
        this.scheduleBreakpointFetch_(debuggee, 0, false, callback);
    }

    // FIXME: This is a simplification of debuglet.scheduleBreakpointFetch_ and will need repairs.
    scheduleBreakpointFetch_(debuggee: Debuggee, seconds: number, once: boolean, callback: (
        err: Error | null,
        breakpoints: stackdriver.Breakpoint[]
    ) => void
    ): void {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;
        setTimeout(() => {
            that.logger.info('Fetching breakpoints');
            // TODO: Address the case when `that.debuggee` is `null`.
            that.listBreakpoints(
                debuggee,
                (err, response, body) => {
                    if (err) {
                        that.logger.error(
                            'Error fetching breakpoints – scheduling retry',
                            err
                        );
                        // TODO: Decide whether to return an error or just schedule the retry here.
                        return;
                    }
                    switch (response!.statusCode) {
                        case 404:
                            // Registration expired. Deactivate the fetcher and queue
                            // re-registration, which will re-active breakpoint fetching.
                            that.logger.info('\t404 Registration expired.');
                            // TODO: Decide whether to return an error or just schedule the retry here.
                            return;

                        default:
                            // TODO: Address the case where `response` is `undefined`.
                            that.logger.info('\t' + response!.statusCode + ' completed.');
                            if (!body) {
                                that.logger.error('\tinvalid list response: empty body');
                                that.scheduleBreakpointFetch_(debuggee, 30, once, callback);  // TODO: Remove fixed number.
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
                                        that.updateBreakpoint(
                                            debuggee,
                                            bp,
                                            (err /*, body*/) => {
                                                if (err) {
                                                    that.logger.error('Unable to complete breakpoint on server', err);
                                                }
                                            }
                                        );
                                        return false;
                                    }
                                    return true;
                                }
                            );
                            callback(null, bps);
                            that.scheduleBreakpointFetch_(
                                debuggee,
                                30,  // TODO: Remove magic number.
                                once, callback
                            );
                    }
                    return;
                }
            );
        }, seconds * 1000).unref();
    }

}