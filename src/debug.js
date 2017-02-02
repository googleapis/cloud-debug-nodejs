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
var common = require('@google-cloud/common');
var util = require('util');

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
 * @param {object} options - [Configuration object](#/docs)
 */
function Debug(options) {
  if (!(this instanceof Debug)) {
    options = common.util.normalizeArguments(this, options);
    return new Debug(options);
  }

  var config = {
    projectIdRequired: false,
    baseUrl: 'https://clouddebugger.googleapis.com/v2',
    scopes: ['https://www.googleapis.com/auth/cloud_debugger'],
    packageJson: require('../package.json')
  };

  common.Service.call(this, config, options);

  // FIXME(ofrobots): We need our own copy of options because Service may
  // default to '{{projectId}}' when options doesn't contain the `projectId`.
  // property. This breaks the SSOT principle. Remove this when
  // https://github.com/GoogleCloudPlatform/google-cloud-node/issues/1891
  // is resolved.
  this.options = options;
}
util.inherits(Debug, common.Service);

module.exports = Debug;