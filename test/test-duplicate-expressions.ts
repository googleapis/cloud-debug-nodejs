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

var breakpointInFoo = {
  id: 'fake-id-123',
  location: { path: 'test-duplicate-expressions-code.js', line: 4 }
};

import * as commonTypes from '../src/types/common-types';

import * as assert from 'assert';
import * as extend from 'extend';
import * as v8debugapi from '../src/agent/v8debugapi';
const common: commonTypes.Common = require('@google-cloud/common');
import defaultConfig from '../src/agent/config';
import * as SourceMapper from '../src/agent/sourcemapper';
import * as scanner from '../src/agent/scanner';
var foo = require('./test-duplicate-expressions-code.js');

// TODO: Determine why this must be named `stateIsClean1`.
function stateIsClean1(api) {
  assert.equal(api.numBreakpoints_(), 0,
    'there should be no breakpoints active');
  assert.equal(api.numListeners_(), 0,
    'there should be no listeners active');
  return true;
}

describe(__filename, function() {
  var config = extend({}, defaultConfig, {
    workingDirectory: __dirname,
    forceNewAgent_: true
  });
  // TODO: It appears `logLevel` is a typo and should be `level`.  However,
  //       with this change, the tests fail.  Resolve this.
  var logger = new common.logger({ logLevel: config.logLevel } as any as commonTypes.LoggerOptions);
  var api = null;

  beforeEach(function(done) {
    if (!api) {
      scanner.scan(true, config.workingDirectory, /.js$/)
        .then(function (fileStats) {
          var jsStats = fileStats.selectStats(/.js$/);
          var mapFiles = fileStats.selectFiles(/.map$/, process.cwd());
          SourceMapper.create(mapFiles, function (err, mapper) {
            assert(!err);

            api = v8debugapi.create(logger, config, jsStats, mapper);
            assert.ok(api, 'should be able to create the api');
            done();
          });
        });
    } else {
      assert(stateIsClean1(api));
      done();
    }
  });
  afterEach(function() { assert(stateIsClean1(api)); });

  it('should not duplicate expressions', function(done) {
    api.set(breakpointInFoo, function(err) {
      assert.ifError(err);
      api.wait(breakpointInFoo, function(err) {
        assert.ifError(err);
        // TODO: Determine how to remove this cast to any.
        var frames = (breakpointInFoo as any).stackFrames[0];
        var exprs = frames.arguments.concat(frames.locals);
        var varTableIndicesSeen = [];
        exprs.forEach(function(expr) {
          assert.equal(varTableIndicesSeen.indexOf(expr.varTableIndex), -1);
          varTableIndicesSeen.push(expr.varTableIndex);
        });
        api.clear(breakpointInFoo);
        done();
      });
      process.nextTick(foo);
    });
  });
});
