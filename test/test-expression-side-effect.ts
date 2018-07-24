/**
 * Copyright 2017 Google Inc. All Rights Reserved.
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
import * as utils from '../src/agent/util/utils';
import * as debugapi from '../src/agent/v8/debugapi';
import {StatusMessage} from '../src/client/stackdriver/status-message';
import consoleLogLevel = require('console-log-level');
import * as stackdriver from '../src/types/stackdriver';

const code = require('./test-expression-side-effect-code.js');


// the inspector protocol is only used on Node >= 10 and thus isn't
// tested on earlier versions
const itWithInspector = utils.satisfies(process.version, '>=10') ? it : it.skip;

describe('evaluating expressions', () => {
  let api: debugapi.DebugApi;
  const config = extend({}, defaultConfig, {forceNewAgent_: true});

  before(done => {
    const logger =
        consoleLogLevel({level: Debuglet.logLevelToName(config.logLevel)});
    scanner.scan(true, config.workingDirectory, /\.js$/)
        .then(async fileStats => {
          const jsStats = fileStats.selectStats(/\.js$/);
          const mapFiles = fileStats.selectFiles(/\.map$/, process.cwd());
          const mapper = await SourceMapper.create(mapFiles);
          assert(mapper);
          api = debugapi.create(logger, config, jsStats, mapper!);
          done();
        });
  });

  itWithInspector(
      'should evaluate expressions without side effects', (done) => {
        // this test makes sure that the necessary environment variables to
        // enable asserts are present during testing. Use run-tests.sh, or
        // export CLOUD_DEBUG_ASSERTIONS=1 to make sure this test passes.
        const bp: stackdriver.Breakpoint = {
          id: 'fake-id-123',
          location: {
            path: 'build/test/test-expression-side-effect-code.js',
            line: 16
          },
          expressions: ['item.getPrice()']
        } as stackdriver.Breakpoint;

        api.set(bp, err => {
          assert.ifError(err);
          api.wait(bp, err => {
            assert.ifError(err);
            const watch = bp.evaluatedExpressions[0];
            assert.strictEqual((watch as {value: string}).value, '2');
            api.clear(bp, err => {
              assert.ifError(err);
              done();
            });
          });
          process.nextTick(() => {
            code.foo();
          });
        });
      });

  itWithInspector(
      'should not evaluate expressions with side effects', (done) => {
        // this test makes sure that the necessary environment variables to
        // enable asserts are present during testing. Use run-tests.sh, or
        // export CLOUD_DEBUG_ASSERTIONS=1 to make sure this test passes.
        const bp: stackdriver.Breakpoint = {
          id: 'fake-id-123',
          location: {
            path: 'build/test/test-expression-side-effect-code.js',
            line: 16
          },
          expressions: ['item.increasePriceByOne()']
        } as stackdriver.Breakpoint;

        api.set(bp, err => {
          assert.ifError(err);
          api.wait(bp, err => {
            assert.ifError(err);
            const watch = bp.evaluatedExpressions[0];
            assert((watch as {status: StatusMessage}).status.isError);
            api.clear(bp, err => {
              assert.ifError(err);
              done();
            });
          });
          process.nextTick(() => {
            code.foo();
          });
        });
      });

  itWithInspector('should not evaluate process.title', (done) => {
    // this test makes sure that the necessary environment variables to enable
    // asserts are present during testing. Use run-tests.sh, or export
    // CLOUD_DEBUG_ASSERTIONS=1 to make sure this test passes.
    const bp: stackdriver.Breakpoint = {
      id: 'fake-id-123',
      location:
          {path: 'build/test/test-expression-side-effect-code.js', line: 16},
      expressions: ['process']
    } as stackdriver.Breakpoint;

    api.set(bp, err => {
      assert.ifError(err);
      api.wait(bp, err => {
        assert.ifError(err);
        const exp = bp.evaluatedExpressions[0];
        assert(exp);
        const varIndex = exp!.varTableIndex;
        assert(varIndex);
        const members = bp.variableTable[varIndex!]!.members;
        assert(members);
        for (const entry of members!) {
          if (entry.name === 'title') {
            assert(entry.value === undefined);
          }
        }

        api.clear(bp, err => {
          assert.ifError(err);
          done();
        });
      });
      process.nextTick(() => {
        code.foo();
      });
    });
  });
});
