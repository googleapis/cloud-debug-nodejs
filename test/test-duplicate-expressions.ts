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

import consoleLogLevel = require('console-log-level');
import * as stackdriver from '../src/types/stackdriver';

// TODO: Have this actually implement Breakpoint
const breakpointInFoo: stackdriver.Breakpoint = {
  id: 'fake-id-123',
  location: {path: 'test-duplicate-expressions-code.js', line: 4}
} as stackdriver.Breakpoint;

import * as assert from 'assert';
import * as extend from 'extend';
import * as debugapi from '../src/agent/v8/debugapi';
import {defaultConfig} from '../src/agent/config';
import * as SourceMapper from '../src/agent/io/sourcemapper';
import * as scanner from '../src/agent/io/scanner';
import {Debuglet} from '../src/agent/debuglet';
const foo = require('./test-duplicate-expressions-code.js');

// TODO: Determine why this must be named `stateIsClean1`.
function stateIsClean1(api: debugapi.DebugApi): boolean {
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
      assert(stateIsClean1(api));
      done();
    }
  });
  afterEach(() => {
    assert(stateIsClean1(api));
  });

  it('should not duplicate expressions', (done) => {
    api.set(breakpointInFoo, (err1) => {
      assert.ifError(err1);
      api.wait(breakpointInFoo, (err2) => {
        assert.ifError(err2);
        // TODO: Determine how to remove this cast to any.
        const frames = breakpointInFoo.stackFrames[0];
        const exprs = frames.arguments.concat(frames.locals);
        const varTableIndicesSeen: number[] = [];
        exprs.forEach((expr) => {
          // TODO: Handle the case when expr.varTableIndex is undefined
          assert.strictEqual(
              varTableIndicesSeen.indexOf(expr.varTableIndex as number), -1);
          varTableIndicesSeen.push(expr.varTableIndex as number);
        });
        api.clear(breakpointInFoo, (err) => {
          assert.ifError(err);
          done();
        });
      });
      process.nextTick(foo);
    });
  });
});
