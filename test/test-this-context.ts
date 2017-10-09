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
import * as stackdriver from '../src/types/stackdriver';

import * as assert from 'assert';
import * as extend from 'extend';
import * as debugapi from '../src/agent/v8/debugapi';
const common: commonTypes.Common = require('@google-cloud/common');
import defaultConfig from '../src/agent/config';
import * as SourceMapper from '../src/agent/io/sourcemapper';
import * as scanner from '../src/agent/io/scanner';
const code = require('./test-this-context-code.js');

function stateIsClean(api: debugapi.DebugApi): boolean {
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
  let api: debugapi.DebugApi;

  beforeEach(function(done) {
    if (!api) {
      scanner.scan(true, config.workingDirectory, /.js$/)
        .then(function (fileStats) {
          const jsStats = fileStats.selectStats(/.js$/);
          const mapFiles = fileStats.selectFiles(/.map$/, process.cwd());
          SourceMapper.create(mapFiles, function (err, mapper) {
            assert(!err);

            // TODO: Handle the case when mapper is undefined
            // TODO: Handle the case when v8debugapi.create returns null
            api = debugapi.create(logger, config, jsStats, mapper as SourceMapper.SourceMapper) as debugapi.DebugApi;
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
  it('Should be able to read the argument and the context', function(done) {
    // TODO: Have this actually implement Breakpoint
    const brk: stackdriver.Breakpoint = {
      id: 'fake-id-123',
      location: { path: 'test-this-context-code.js', line: 5 }
    } as stackdriver.Breakpoint;
    let ctxMembers;
    api.set(brk, function(err) {
      assert.ifError(err);
      api.wait(brk, function(err) {
        assert.ifError(err);
        // TODO: Determine how to remove this cast to any.
        const frame = (brk as any).stackFrames[0];
        const args = frame.arguments;
        const locals = frame.locals;
        // TODO: Determine how to remove these casts to any.
        ctxMembers = (brk as any).variableTable.slice((brk as any).variableTable.length-1)[0]
          .members;
        assert.deepEqual(ctxMembers.length, 1,
          'There should be one member in the context variable value');
        assert.deepEqual(ctxMembers[0], {name: 'a', value: '10'});
        assert.equal(args.length, 0, 'There should be zero arguments');
        assert.equal(locals.length, 2, 'There should be two locals');
        assert.deepEqual(locals[0], {name: 'b', value: '1'});
        assert.deepEqual(locals[1].name, 'context');
        api.clear(brk, function(err) {
          assert.ifError(err);
          done();
        });
      });
      process.nextTick(code.foo.bind({}, 1));
    });
  });
  it('Should be able to read the argument and deny the context', function(done) {
    // TODO: Have this actually implement Breakpoint
    const brk = {
      id: 'fake-id-123',
      location: { path: 'test-this-context-code.js', line: 9 }
    } as stackdriver.Breakpoint;
    api.set(brk, function(err) {
      assert.ifError(err);
      api.wait(brk, function(err) {
        assert.ifError(err);
        // TODO: Determine how to remove this cast to any.
        const frame = (brk as any).stackFrames[0];
        const args = frame.arguments;
        const locals = frame.locals;
        assert.equal(args.length, 0, 'There should be zero arguments');
        assert.equal(locals.length, 1, 'There should be one local');
        assert.deepEqual(locals[0], {name: 'j', value: '1'});
        api.clear(brk, function(err) {
          assert.ifError(err);
          done();
        });
      });
      process.nextTick(code.bar.bind(null, 1));
    });
  });
});
