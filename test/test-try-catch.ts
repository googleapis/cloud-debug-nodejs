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

import * as commonTypes from '../src/types/common-types';

import * as assert from 'assert';
import * as extend from 'extend';
import * as v8debugapi from '../src/agent/v8debugapi';
const common: commonTypes.Common = require('@google-cloud/common');
import * as defaultConfig from '../src/agent/config';
import {SourceMapper} from '../src/agent/sourcemapper';
import * as scanner from '../src/agent/scanner';
var foo = require('./test-try-catch-code.js');

function stateIsClean(api) {
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
  var logger = common.logger({ logLevel: config.logLevel });
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
      assert(stateIsClean(api));
      done();
    }
  });
  afterEach(function() { assert(stateIsClean(api)); });
  it('Should read e as the caught error', function(done) {
    var brk = {
      id: 'fake-id-123',
      location: { path: 'test-try-catch-code.js', line: 7 }
    };
    api.set(brk, function(err) {
      assert.ifError(err);
      api.wait(brk, function(err) {
        assert.ifError(err);
        // TODO: Determine how to remove this cast to any.
        var frame = (brk as any).stackFrames[0];
        var args = frame.arguments;
        var locals = frame.locals;
        assert.equal(locals.length, 1, 'There should be one local');
        assert.equal(args.length, 0, 'There should be zero arguments');
        var e = locals[0];
        assert(e.name === 'e');
        assert(Number.isInteger(e.varTableIndex));
        assert.equal(args.length, 0, 'There should be zero arguments');     
        api.clear(brk);
        done();
      });
      process.nextTick(foo.bind(null, 'test'));
    });
  });
  it('Should read e as the local error', function(done) {
    var brk = {
      id: 'fake-id-123',
      location: { path: 'test-try-catch-code.js', line: 8 }
    };
    api.set(brk, function(err) {
      assert.ifError(err);
      api.wait(brk, function(err) {
        assert.ifError(err);
        // TODO: Determine how to remove this cast to any.
        var frame = (brk as any).stackFrames[0];
        var args = frame.arguments;
        var locals = frame.locals;
        assert.equal(args.length, 0, 'There should be zero arguments');
        assert.equal(locals.length, 1, 'There should be one local');
        assert.deepEqual(
          locals[0],
          {name: 'e', value: '2'}
        );
        assert.equal(args.length, 0, 'There should be zero arguments');
        api.clear(brk);
        done();
      });
      process.nextTick(foo.bind(null, 'test'));
    });
  });
});
