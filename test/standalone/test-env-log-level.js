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

var LOGLEVEL = 4;
process.env.GCLOUD_DEBUG_LOGLEVEL = LOGLEVEL;

var assert = require('assert');
var proxyquire = require('proxyquire');
var common = require('@google/cloud-diagnostics-common');

// Mock the logger.
var count = 0;
var logger = {
  create: function() {
    return {
      error: function() { count++; },
      warn: function()  { count++; },
      info: function()  { count++; },
      debug: function() { count++; }
    };
  }
}

describe('should respect environment variables', function() {
  it('should respect GCLOUD_DEBUG_LOGLEVEL', function(done) {
    var agent = require('../../');

    var DebugletApi = proxyquire('../..', {
      '@google/cloud-diagnostics-common': {
        logger: logger,
        utils: common.utils
      }
    });

    setTimeout(function() {
      assert(count > 0, 'Should have logged something');
      done();
    }, 2000)

  });
});
