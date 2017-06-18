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

'use strict';

var Debug = require('./debug.js');
var Debuglet = require('./agent/debuglet.js');

// Singleton.
var debuglet;

/**
 * Start the Debug agent that will make your application available for debugging
 * with Stackdriver Debug.
 *
 * @param {object=} options - Options
 * @param {object=} options.debugAgent - Debug agent configuration
 * TODO: add an optional callback function.
 *
 * @resource [Introductory video]{@link
 * https://www.youtube.com/watch?v=tyHcK_kAOpw}
 *
 * @example
 * debug.startAgent();
 */
function start(options) {
  options = options || {};
  var agentConfig = options.debug || options;

  // forceNewAgent_ is for testing purposes only.
  if (debuglet && !agentConfig.forceNewAgent_) {
    throw new Error('Debug Agent has already been started');
  }

  var debug = new Debug(options);
  debuglet = new Debuglet(debug, agentConfig);
  debuglet.start();

  // We return the debuglet to facilitate testing.
  return agentConfig.testMode_ ? debuglet : undefined;
}

module.exports = {
  start: start
};
