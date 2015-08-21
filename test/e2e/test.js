/* KEEP THIS CODE AT THE TOP SO THAT THE BREAKPOINT LINE NUMBERS DON'T CHANGE */
'use strict';
function fib(n) {
	if (n < 2) { return n; }
	return fib(n - 1) + fib(n - 2);
}
/**
 * Copyright 2015 Google Inc. All Rights Reserved.
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

process.env.GCLOUD_INSIGHTS_LOGLEVEL=4;
process.env.GCLOUD_DEBUG_ENABLED=true;

var assert = require('assert');
var util = require('util');
var GoogleAuth = require('google-auth-library');
var agent = require('gcloud-insights');
var _ = require('lodash'); // for _.find. Can't use ES6 yet.

var DEBUG_API = 'https://www.googleapis.com/debugger/v1beta';
var SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/cloud_debugger',
  ];

module.exports.runTest = function runTest(callback) {
	setTimeout(function() {
		assert.ok(agent.debug, 'debuglet has initialized');
		assert.ok(agent.debug.api_, 'debuglet api is active');
		assert.ok(agent.debug.api_.debuggeeId_, 'debuglet has registered');

		var debuggee = agent.debug.api_.debuggeeId_;
		var project = agent.debug.api_.projectNumber_;

		// Get our own credentials because we need an extra scope
		var auth = new GoogleAuth();
		auth.getApplicationDefault(function(err, authClient) {
			if (err) {
				console.log(err);
				return;
			}

	    // Inject scopes if they have not been injected by the environment
	    if (authClient.createScopedRequired && authClient.createScopedRequired()) {
				authClient = authClient.createScoped(SCOPES);
			}

			authClient.request({
				url: DEBUG_API + '/debuggees?project=' + project,
				json: true
			}, function(err, body, response) {
				if (err) {
					console.log(err);
					return;
				}

				assert.ok(body, 'must have ListDebuggees response');
				console.log(util.inspect(body));
				assert.ok(body.debuggees, 'must have debuggees property');
				var result = _.find(body.debuggees, function(d) {
					return d.id === debuggee;
				});
				assert.ok(result, 'must find the debuggee we just registered');

				authClient.request({
					url: DEBUG_API + '/debuggees/' + debuggee + '/breakpoints',
					json: true
				}, function(err, body, response) {
					if (err) {
						console.log(err);
						return;
					}
					assert.ok(body);
					assert.ok(!body.breakpoints, 'no breakpoints should exist');

					// Now set a breakpoint
					authClient.request({
						url: DEBUG_API + '/debuggees/' + debuggee + '/breakpoints/set',
						method: 'POST',
						json: true,
						body: {
							id: 'breakpoint-1',
							location: {path: 'test.js', line: 5},
							condition: 'n === 10'
						}
					}, function(err, body, reponse) {
						assert.ok(body.breakpoint);
						var breakpoint = body.breakpoint;
						console.log(breakpoint);
						assert.ok(breakpoint.id);
						assert.ok(breakpoint.location);
						assert.strictEqual(breakpoint.location.path, 'test.js');

						console.log('waiting a bit before running fib...');
						setTimeout(function() {
							console.log('running fib');
							fib(23);
							console.log('waiting a bit before checking if the breakpoint was hit...');
							setTimeout(function() {
								authClient.request({
									url: DEBUG_API + '/debuggees/' + debuggee + '/breakpoints/' +
										breakpoint.id
								}, function(err, body, response) {
									assert.ok(body.breakpoint);
									var hit = body.breakpoint;
									console.log(util.inspect(hit));
									assert.ok(hit.isFinalState);
									assert.ok(hit.stackFrames);
									//console.log(util.inspect(hit.stackFrames));

									var top = hit.stackFrames[0];
									assert.ok(top.function);
									assert.strictEqual(top.function, 'fib');

									//console.log(util.inspect(top.arguments));
									var arg = _.find(top.arguments, function(a) {
										return a.name === 'n';
									});
									assert.ok(arg);
									assert.strictEqual(arg.value, '10');
									console.log('Test passed.');
									callback('Test passed.');
								});
							}, 10 * 1000);
						}, 10 * 1000);
					});
				});
			});
		});
	}, 10 * 1000);


};

// check if we were launched directly, if so run the test
if (!module.parent) {
	module.exports.runTest(function(result) {
		console.log(result);
	});
}
