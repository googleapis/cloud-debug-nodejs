/**
 * Copyright 2018 Google Inc. All Rights Reserved.
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

import {defaultConfig} from '../src/agent/config';
import {Debuglet} from '../src/agent/debuglet';
import * as scanner from '../src/agent/io/scanner';
import * as SourceMapper from '../src/agent/io/sourcemapper';
import * as utils from '../src/agent/util/utils';
import * as debugapi from '../src/agent/v8/debugapi';

import consoleLogLevel = require('console-log-level');
import * as stackdriver from '../src/types/stackdriver';
import {Variable} from '../src/types/stackdriver';

const code = require('./test-circular-code.js');

// the inspector protocol is only used on Node >= 10 and thus isn't
// tested on earlier versions
const skipIfInspector = utils.satisfies(process.version, '>=10') ? it.skip : it;

function stateIsClean(api: debugapi.DebugApi): boolean {
  assert.strictEqual(
      api.numBreakpoints_(), 0, 'there should be no breakpoints active');
  assert.strictEqual(
      api.numListeners_(), 0, 'there should be no listeners active');
  return true;
}

describe(__filename, () => {
  const config = Object.assign(
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
            api = debugapi.create(
                      logger, config, jsStats,
                      mapper as SourceMapper.SourceMapper) as debugapi.DebugApi;
            assert.ok(api, 'should be able to create the api');
            done();
          });
    } else {
      assert(stateIsClean(api));
      done();
    }
  });
  afterEach(() => {
    assert(stateIsClean(api));
  });
  skipIfInspector(
      'Should be able to read the argument and the context', (done) => {
        // TODO: Have this actually implement Breakpoint
        const brk: stackdriver.Breakpoint = {
          id: 'fake-id-123',
          location: {path: 'test-circular-code.js', line: 7}
        } as stackdriver.Breakpoint;
        api.set(brk, (err1) => {
          assert.ifError(err1);
          api.wait(brk, (err2) => {
            assert.ifError(err2);
            assert.ok(brk.stackFrames.length >= 1);
            const locals = brk.stackFrames[0].locals;
            const nonStatusVars =
                brk.variableTable.filter(entry => entry && !!entry.members) as
                Variable[];
            assert.strictEqual(locals.length, 2);
            assert.strictEqual(locals[0].name, 'a');
            assert.strictEqual(locals[1].name, 'b');
            assert.strictEqual(
                nonStatusVars.length, 2,
                'There should be two non-status variables in brk.variableTable');
            assert.ok(nonStatusVars[0].members);  // a
            assert.ok(nonStatusVars[0].members!.find(
                entry => entry.name === 'b'));    // a.b = b
            assert.ok(nonStatusVars[1].members);  // b
            assert.ok(nonStatusVars[1].members!.find(
                entry => entry.name === 'a'));  // b.a = a
            api.clear(brk, (err3) => {
              assert.ifError(err3);
              done();
            });
          });
          process.nextTick(code.foo);
        });
      });
});
