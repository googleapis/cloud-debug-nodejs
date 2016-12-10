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

var logger = require('@google/cloud-diagnostics-common').logger;
var Debuglet = require('./debuglet.js');
var _ = require('lodash');

/**
 * <p class="notice">
 *   **This is an experimental release of Stackdriver Debug.** This API is not 
 *   covered by any SLA of deprecation policy and may be subject to backwards
 *   incompatible changes.
 * </p>
 * 
 * This module provides Stackdriver Debugger support for Node.js applications. 
 * [Stackdriver Debugger](https://cloud.google.com/debug/) is a feature of 
 * [Google Cloud Platform](https://cloud.google.com/) that lets you debug your
 * applications in production without stopping or pausing your application.
 * 
 * This module provides an agent that lets you automatically enable debugging
 * without changes to your application. 
 * 
 * @constructor
 * @alias module:debug
 * 
 * @resource [What is Stackdriver Debug]{@link https://cloud.google.com/debug/}
 * 
 * @param {object} options - [Configuration object](#/docs). NOTE: at the moment
 *    this parameter is ignored.
 */
function Debug(options) {
  if (!(this instanceof Debug)) {
    //TODO(ofrobots)
    //options = common.util.normalizeArguments(this, options);
    return new Debug(options);
  }
}

var initConfig = function(config_) {
  var config = config_ || {};

  var defaults = require('./config.js').debug;
  _.defaultsDeep(config, defaults);
  if (process.env.hasOwnProperty('GCLOUD_DEBUG_LOGLEVEL')) {
    config.logLevel = process.env.GCLOUD_DEBUG_LOGLEVEL;
  }
  if (process.env.hasOwnProperty('GAE_MODULE_NAME')) {
    config.serviceContext = config.serviceContext || {};
    config.serviceContext.service = process.env.GAE_MODULE_NAME;
  }
  if (process.env.hasOwnProperty('GAE_MODULE_VERSION')) {
    config.serviceContext = config.serviceContext || {};
    config.serviceContext.version = process.env.GAE_MODULE_VERSION;
  }
  return config;
};

var debuglet;

/**
 * Start the Debug agent that will make your application available for debugging
 * with Stackdriver Debug.
 * 
 * @param {object=} config - Debug configuration. TODO(ofrobots): get rid of
 *     config.js and include jsdoc here
 * TODO: add an optional callback function.
 * 
 * @resource [Introductory video]{@link https://www.youtube.com/watch?v=tyHcK_kAOpw}
 * 
 * @example
 * debug.startAgent();
 */
Debug.prototype.startAgent = function(config_) {
  if (debuglet) {
    throw new Error('Debug Agent has already been started');
  }
  var config = initConfig(config_);
  if (config.enabled) {
    debuglet = new Debuglet(config, logger.create(config.logLevel, '@google-cloud/debug'));
    debuglet.start();
    this.private_ = debuglet;
  }
};

module.exports = Debug;

