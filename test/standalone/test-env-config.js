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
    agent.start({
      testPriority: 'from the supplied config',
      logLevel: 2 // this value is intentionally different from the value
                  // specified in the config file specified by 
                  // GCLOUD_DIAGNOSTICS_CONFIG and the value of the 
                  // environment value GCLOUD_DEBUG_LOGLEVEL
    });
    var config = agent.private_.config_;
    // This assert tests that the value set by an environment variable 
    // takes priority over the value in the config file and priority over 
    // the value given to the config supplied to the start() method.
    // Set by env var
    assert.equal(config.logLevel, 1);
    // Set by env var
    assert.equal(config.serviceContext.service, 'a new name');
    // Set by env var
    assert.equal(config.serviceContext.version, 'a new version');
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
    // This assert verifies that the value specified in the config given 
    // to the start() method takes priority over the value specified in 
    // the config file.
    // In the config passed to the start() method
    assert.equal(config.testPriority, 'from the supplied config');
  });

});
