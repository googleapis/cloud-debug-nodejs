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

// NOTE: this file is on the critical path for the startup of the user's
// application. The path-length here needs to be minimal.

var config = require('./config.js');
var agents = [];
var agent;

// exports is populated by the agents below
module.exports = {};

if (config.debug.enabled) {
  agent = require('./lib/debug/debuglet.js');
  agents.push(agent);
}

if (config.trace.enabled) {
  agent = require('./lib/trace/agent.js');
  agents.push(agent);
}

if (config.profile.enabled) {
  agent = require('./lib/profile/agent.js');
  agents.push(agent);
}

// If we have at least one agent active
if (agents.length > 0) {
  // First activate a logger
  var Logger = require('./lib/logger.js');
  var logger = new Logger(config.logLevel, 'gcloud-insights');

  agents.forEach(function(a) {
    a.start(config, logger, module.exports);
  });

}
