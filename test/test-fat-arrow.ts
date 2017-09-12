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
import * as apiTypes from '../src/types/api-types';
import {DebugApi} from '../src/agent/debugapi';

import * as assert from 'assert';
import * as extend from 'extend';
import * as debugapi from '../src/agent/debugapi';
const common: commonTypes.Common = require('@google-cloud/common');
import defaultConfig from '../src/agent/config';
import * as SourceMapper from '../src/agent/sourcemapper';
import * as scanner from '../src/agent/scanner';

process.env.GCLOUD_PROJECT = '0';

function stateIsClean(api: DebugApi): boolean {
  assert.equal(api.numBreakpoints_(), 0,
    'there should be no breakpoints active');
  assert.equal(api.numListeners_(), 0,
    'there should be no listeners active');
  return true;
}

describe(__filename, function() {
  const config = extend({}, defaultConfig, {
    workingDirectory: __dirname,
    forceNewAgent_: true
  });
  // TODO: It appears `logLevel` is a typo and should be `level`.  However,
  //       with this change, the tests fail.  Resolve this.
  const logger = new common.logger({ levelLevel: config.logLevel } as any as commonTypes.LoggerOptions);
  let api: DebugApi;
  let foo: () => number;
  before(function () {
    foo = require('./fixtures/fat-arrow.js');
  });
  beforeEach(function(done) {
    if (!api) {
      scanner.scan(true, config.workingDirectory, /.js$/)
        .then(function (fileStats) {
          const jsStats = fileStats.selectStats(/.js$/);
          const mapFiles = fileStats.selectFiles(/.map$/, process.cwd());
          // TODO: Determine if the err parameter should be used.
          SourceMapper.create(mapFiles, function (_err, mapper) {
            // TODO: Handle the case when mapper is undefined
            // TODO: Handle the case when v8debugapi.create returns null
            api = debugapi.create(logger, config, jsStats, mapper as SourceMapper.SourceMapper) as DebugApi;
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
    // TODO: Have this implement Breakpoint
    const brk: apiTypes.Breakpoint = {
      id: 'fake-id-123',
      location: { path: 'fixtures/fat-arrow.js', line: 5 }
    } as apiTypes.Breakpoint;
    api.set(brk, function(err) {
      assert.ifError(err);
      api.wait(brk, function(err) {
        assert.ifError(err);
        const frame = brk.stackFrames[0];
        const args = frame.arguments;
        const locals = frame.locals;
        assert.equal(args.length, 0, 'There should be zero arguments');
        assert.equal(locals.length, 1, 'There should be one local');
        assert.deepEqual(
          locals[0],
          {name: 'b', value: '1'}
        );
        api.clear(brk, function(err) {
          assert.ifError(err);
          done();
        });
      });
      process.nextTick(foo.bind(null, 'test'));
    });
  });
   it('Should process the argument value change of the fat arrow', function(done) {
    // TODO: Have this implement Breakpoint
    const brk: apiTypes.Breakpoint = {
      id: 'fake-id-123',
      location: { path: 'fixtures/fat-arrow.js', line: 6 }
    } as apiTypes.Breakpoint;
    api.set(brk, function(err) {
      assert.ifError(err);
      api.wait(brk, function(err) {
        assert.ifError(err);
        // TODO: Fix this explicit cast.
        const frame = brk.stackFrames[0];
        const args = frame.arguments;
        const locals = frame.locals;
        assert.equal(args.length, 0, 'There should be zero arguments');
        assert.equal(locals.length, 1, 'There should be one local');
        assert.deepEqual(
          locals[0],
          {name: 'b', value: '2'}
        );
        api.clear(brk, function(err) {
          assert.ifError(err);
          done();
        });
      });
      process.nextTick(foo.bind(null, 'test'));
    });
  });
});
