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

import * as assert from 'assert';
import * as extend from 'extend';

import {defaultConfig} from '../src/agent/config';
import {Debuglet} from '../src/agent/debuglet';
import * as scanner from '../src/agent/io/scanner';
import * as SourceMapper from '../src/agent/io/sourcemapper';
import * as debugapi from '../src/agent/v8/debugapi';
import consoleLogLevel = require('console-log-level');
import * as stackdriver from '../src/types/stackdriver';

const foo = require('./test-duplicate-nested-expressions-code.js');

// TODO: Determine why this must be named `_stateIsClean`.
function stateIsClean2(api: debugapi.DebugApi): boolean {
  assert.strictEqual(
      api.numBreakpoints_(), 0, 'there should be no breakpoints active');
  assert.strictEqual(
      api.numListeners_(), 0, 'there should be no listeners active');
  return true;
}

describe(__filename, () => {
  const config = extend(
      {}, defaultConfig, {workingDirectory: __dirname, forceNewAgent_: true});
  const logger =
      consoleLogLevel({level: Debuglet.logLevelToName(config.logLevel)});
  let api: debugapi.DebugApi;

  beforeEach((done) => {
    if (!api) {
      scanner.scan(true, config.workingDirectory, /.js$/)
          .then(async (fileStats) => {
            assert.strictEqual(fileStats.errors().size, 0);
            const jsStats = fileStats.selectStats(/.js$/);
            const mapFiles = fileStats.selectFiles(/.map$/, process.cwd());
            const mapper = await SourceMapper.create(mapFiles);
            // TODO: Handle the case when mapper is undefined
            // TODO: Handle the case when v8debugapi.create returns null
            api = debugapi.create(
                      logger, config, jsStats,
                      mapper as SourceMapper.SourceMapper) as debugapi.DebugApi;
            assert.ok(api, 'should be able to create the api');
            done();
          });
    } else {
      assert(stateIsClean2(api));
      done();
    }
  });
  afterEach(() => {
    assert(stateIsClean2(api));
  });
  it('Should read the argument before the name is confounded', (done) => {
    // TODO: Have this actually implement Breakpoint
    const brk: stackdriver.Breakpoint = {
      id: 'fake-id-123',
      location: {path: 'test-duplicate-nested-expressions-code.js', line: 4}
    } as stackdriver.Breakpoint;
    api.set(brk, (err1) => {
      assert.ifError(err1);
      api.wait(brk, (err2) => {
        assert.ifError(err2);
        const frame = brk.stackFrames[0];
        const args = frame.arguments;
        const locals = frame.locals;
        assert.strictEqual(args.length, 0, 'There should be zero arguments');
        assert.strictEqual(locals.length, 1, 'There should be one locals');
        assert.deepStrictEqual(locals[0], {name: 'a', value: 'test'});
        api.clear(brk, (err3) => {
          assert.ifError(err3);
          done();
        });
      });
      process.nextTick(foo.bind(null, 'test'));
    });
  });

  it('Should read an argument after the name is confounded', (done) => {
    // TODO: Have this actually implement Breakpoint
    const brk: stackdriver.Breakpoint = {
      id: 'fake-id-1234',
      location: {path: 'test-duplicate-nested-expressions-code.js', line: 5}
    } as stackdriver.Breakpoint;
    api.set(brk, (err1) => {
      assert.ifError(err1);
      api.wait(brk, (err2) => {
        assert.ifError(err2);
        const frame = brk.stackFrames[0];
        const args = frame.arguments;
        const locals = frame.locals;
        assert.strictEqual(args.length, 0, 'There should be zero arguments');
        assert.strictEqual(locals.length, 1, 'There should be one local');
        assert.deepStrictEqual(locals[0], {name: 'a', value: '10'});
        api.clear(brk, (err3) => {
          assert.ifError(err3);
          done();
        });
      });
      process.nextTick(foo.bind(null, 'test'));
    });
  });

  it('Should read an argument value after its value is modified', (done) => {
    // TODO: Have this actually implement Breakpoint
    const brk: stackdriver.Breakpoint = {
      id: 'fake-id-1234',
      location: {path: 'test-duplicate-nested-expressions-code.js', line: 6}
    } as stackdriver.Breakpoint;
    api.set(brk, (err1) => {
      assert.ifError(err1);
      api.wait(brk, (err2) => {
        assert.ifError(err2);
        const frame = brk.stackFrames[0];
        const args = frame.arguments;
        const locals = frame.locals;
        assert.strictEqual(args.length, 0, 'There should be zero arguments');
        assert.strictEqual(locals.length, 1, 'There should be one local');
        assert.deepStrictEqual(locals[0], {name: 'a', value: '11'});
        api.clear(brk, (err3) => {
          assert.ifError(err3);
          done();
        });
      });
      process.nextTick(foo.bind(null, 'test'));
    });
  });

  it('Should represent a const name at its local-scope when clearly defined',
     (done) => {
       // TODO: Have this actually implement Breakpoint
       const brk: stackdriver.Breakpoint = {
         id: 'fake-id-1234',
         location:
             {path: 'test-duplicate-nested-expressions-code.js', line: 8}
       } as stackdriver.Breakpoint;
       api.set(brk, (err1) => {
         assert.ifError(err1);
         api.wait(brk, (err2) => {
           assert.ifError(err2);
           const frame = brk.stackFrames[0];
           const args = frame.arguments;
           const locals = frame.locals;
           assert.strictEqual(args.length, 0, 'There should be zero arguments');
           assert.strictEqual(locals.length, 2, 'There should be two locals');
           assert.deepStrictEqual(locals[0], {name: 'b', value: 'undefined'});
           assert.deepStrictEqual(locals[1], {name: 'a', value: 'true'});
           api.clear(brk, (err3) => {
             assert.ifError(err3);
             done();
           });
         });
         process.nextTick(foo.bind(null, 'test'));
       });
     });
});
