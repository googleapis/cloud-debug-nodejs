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

var logger = require('@google/cloud-diagnostics-common').logger;
var Debuglet = require('./lib/debuglet.js');
var path = require('path');
var _ = require('lodash');

var initConfig = function() {
  var config = {};
  if (process.env.hasOwnProperty('GCLOUD_DIAGNOSTICS_CONFIG')) {
    var c = require(path.resolve(process.env.GCLOUD_DIAGNOSTICS_CONFIG));
    if (c && c.debug) {
      _.defaultsDeep(config, c.debug);
    }
  }
  var defaults = require('./config.js').debug;
  _.defaultsDeep(config, defaults);
  if (process.env.hasOwnProperty('GCLOUD_DEBUG_LOGLEVEL')) {
    config.logLevel = process.env.GCLOUD_DEBUG_LOGLEVEL;
  }
  if (process.env.hasOwnProperty('GCLOUD_DEBUG_DISABLE')) {
    config.enabled = false;
  }
  if (process.env.hasOwnProperty('GCLOUD_DEBUG_REPO_APP_PATH')) {
    config.appPathRelativeToRepository =
      process.env.GCLOUD_DEBUG_REPO_APP_PATH;
  }
  return config;
};

// exports is populated by the agent
module.exports = {};
var config = initConfig();

var log = logger.create(config.logLevel, '@google/cloud-debug');

if (config.enabled) {
  var debuglet = new Debuglet(config, log);
  debuglet.start();
  module.exports.private_ = debuglet;
}
