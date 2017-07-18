'use strict';
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
import * as path from 'path';

process.env.GCLOUD_PROJECT = 0;

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
  var foo;
  before(function () {
    foo = require('./fixtures/fat-arrow.js');
  });
  beforeEach(function(done) {
    if (!api) {
      scanner.scan(true, config.workingDirectory, /.js$/)
        .then(function (fileStats) {
          var jsStats = fileStats.selectStats(/.js$/);
          var mapFiles = fileStats.selectFiles(/.map$/, process.cwd());
          SourceMapper.create(mapFiles, function (err, mapper) {
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
  it('Should read the argument value of the fat arrow', function(done) {
      var brk = {
        id: 'fake-id-123',
        location: { path: 'fixtures/fat-arrow.js', line: 5 }
      };
    api.set(brk, function(err) {
      assert.ifError(err);
      api.wait(brk, function(err) {
        assert.ifError(err);
        // TODO: Fix this explicit cast.
        var frame = (brk as any).stackFrames[0];
        var args = frame.arguments;
        var locals = frame.locals;
        assert.equal(args.length, 0, 'There should be zero arguments');
        assert.equal(locals.length, 1, 'There should be one local');
        assert.deepEqual(
          locals[0],
          {name: 'b', value: '1'}
        );
        api.clear(brk);
        done();
      });
      process.nextTick(foo.bind(null, 'test'));
    });
  });
   it('Should process the argument value change of the fat arrow', function(done) {
      var brk = {
        id: 'fake-id-123',
        location: { path: 'fixtures/fat-arrow.js', line: 6 }
      };
    api.set(brk, function(err) {
      assert.ifError(err);
      api.wait(brk, function(err) {
        assert.ifError(err);
        // TODO: Fix this explicit cast.
        var frame = (brk as any).stackFrames[0];
        var args = frame.arguments;
        var locals = frame.locals;
        assert.equal(args.length, 0, 'There should be zero arguments');
        assert.equal(locals.length, 1, 'There should be one local');
        assert.deepEqual(
          locals[0],
          {name: 'b', value: '2'}
        );
        api.clear(brk);
        done();
      });
      process.nextTick(foo.bind(null, 'test'));
    });
  });
});
