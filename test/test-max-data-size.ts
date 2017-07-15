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

process.env.GCLOUD_DIAGNOSTICS_CONFIG = 'test/fixtures/test-config.js';

var assert = require('assert');
var extend = require('extend');
var common = require('@google-cloud/common');
var v8debugapi = require('../src/agent/v8debugapi.js');
var SourceMapper = require('../src/agent/sourcemapper.js');
var scanner = require('../src/agent/scanner.js');
var defaultConfig = require('../src/agent/config.js').default;
var path = require('path');
var foo = require('./test-max-data-size-code.js');
// TODO: Determine why the compiler says this must be of type 'string'.
var api: string;

var breakpointInFoo = {
  id: 'fake-id-123',
  location: { path: 'test-max-data-size-code.js', line: 4 }
};

describe('maxDataSize', function() {
  var config = extend({}, defaultConfig, {
    forceNewAgent_: true
  });

  before(function(done) {
    if (!api) {
      var logger = common.logger({ logLevel: config.logLevel });
      scanner.scan(true, config.workingDirectory, /.js$/)
        .then(function (fileStats) {
          var jsStats = fileStats.selectStats(/.js$/);
          var mapFiles = fileStats.selectFiles(/.map$/, process.cwd());
          SourceMapper.create(mapFiles, function (err, mapper) {
            assert(!err);

            api = v8debugapi.create(logger, config, jsStats, mapper);
            done();
          });
        });
    } else {
      done();
    }
  });

  it('should limit data reported', function(done) {
    config.capture.maxDataSize = 5;
    // clone a clean breakpointInFoo
    var bp  = {id: breakpointInFoo.id, location: breakpointInFoo.location};
    // TODO: Determine how to remove this cast to any.
    (api as any).set(bp, function(err) {
      assert.ifError(err);
      // TODO: Determine how to remove this cast to any.
      (api as any).wait(bp, function(err) {
        assert.ifError(err);
        // TODO: Determine how to remove this cast to any.
        assert((bp as any).variableTable.some(function(v) {
          return v.status.description.format === 'Max data size reached';
        }));
        // TODO: Determine how to remove this cast to any.
        (api as any).clear(bp);
        done();
      });
      process.nextTick(function() {foo(2);});
    });
  });

  it('should be unlimited if 0', function(done) {
    config.capture.maxDataSize = 0;
    // clone a clean breakpointInFoo
    var bp  = {id: breakpointInFoo.id, location: breakpointInFoo.location};
    // TODO: Determine how to remove this cast to any.
    (api as any).set(bp, function(err) {
      assert.ifError(err);
      // TODO: Determine how to remove this cast to any.
      (api as any).wait(bp, function(err) {
        assert.ifError(err);
        // TODO: Determine how to remove this cast to any.
        assert((bp as any).variableTable.reduce(function(acc, elem) {
          return acc &&
                 (!elem.status ||
                   elem.status.description.format !== 'Max data size reached');
        }), true);
        // TODO: Determine how to remove this cast to any.
        (api as any).clear(bp);
        done();
      });
      process.nextTick(function() {foo(2);});
    });
  });
});
