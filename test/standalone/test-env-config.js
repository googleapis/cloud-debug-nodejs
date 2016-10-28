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

process.env.GCLOUD_DIAGNOSTICS_CONFIG = 'test/fixtures/test-config.js';
process.env.GCLOUD_DEBUG_LOGLEVEL = 1;
process.env.GAE_MODULE_NAME = 'a new name';
process.env.GAE_MODULE_VERSION = 'a new version';

var assert = require('assert');

describe('should respect environment variables', function() {
  it('should respect GCLOUD_DIAGNOSTICS_CONFIG', function() {
    var agent = require('../..');
    agent.start();
    var config = agent.private_.config_;
    // Set by env var
    assert.equal(config.logLevel, 1);
    // Set by env var
    assert.equal(config.serviceName, 'a new name');
    // Set by env var
    assert.equal(config.serviceVersion, 'a new version');
    // Set default + user config
    assert.equal(config.internal.registerDelayOnFetcherErrorSec, 300);
    // Set by user
    assert.equal(config.capture.includeNodeModules, true);
    // In sub config but not set by user
    assert.equal(config.capture.maxExpandFrames, 5);
    // In top level config set by user
    assert.equal(config.description, 'test config');
    // In top level config not set by user
    assert.equal(config.breakpointUpdateIntervalSec, 10);
  });

});
