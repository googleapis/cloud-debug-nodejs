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

import consoleLogLevel = require('console-log-level');
import * as stackdriver from '../src/types/stackdriver';

import * as assert from 'assert';
import * as extend from 'extend';
import * as debugapi from '../src/agent/v8/debugapi';
import * as SourceMapper from '../src/agent/io/sourcemapper';
import * as scanner from '../src/agent/io/scanner';
import {Debuglet} from '../src/agent/debuglet';
import {defaultConfig} from '../src/agent/config';
const foo = require('./test-max-data-size-code.js');
let api: debugapi.DebugApi;

// TODO: Have this actually implement Breakpoint
const breakpointInFoo: stackdriver.Breakpoint = {
  id: 'fake-id-123',
  location: {path: 'build/test/test-max-data-size-code.js', line: 4}
} as stackdriver.Breakpoint;

describe('maxDataSize', () => {
  const config = extend({}, defaultConfig, {forceNewAgent_: true});

  before((done) => {
    if (!api) {
      const logger =
          consoleLogLevel({level: Debuglet.logLevelToName(config.logLevel)});
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
            done();
          });
    } else {
      done();
    }
  });

  it('should limit data reported', (done) => {
    const oldMaxData = config.capture.maxDataSize;
    config.capture.maxDataSize = 5;
    // clone a clean breakpointInFoo
    // TODO: Have this actually implement Breakpoint.
    const bp: stackdriver.Breakpoint = {
      id: breakpointInFoo.id,
      location: breakpointInFoo.location
    } as stackdriver.Breakpoint;
    // TODO: Determine how to remove this cast to any.
    api.set(bp, (err1) => {
      assert.ifError(err1);
      api.wait(bp, (err2?: Error) => {
        assert.ifError(err2);
        assert(bp.variableTable.some((v) => {
          return v!.status!.description.format === 'Max data size reached';
        }));
        api.clear(bp, (err3) => {
          config.capture.maxDataSize = oldMaxData;
          assert.ifError(err3);
          done();
        });
      });
      process.nextTick(() => {
        foo(2);
      });
    });
  });

  it('should be unlimited if 0', (done) => {
    const oldMaxData = config.capture.maxDataSize;
    config.capture.maxDataSize = 0;
    // clone a clean breakpointInFoo
    // TODO: Have this actually implement breakpoint
    const bp: stackdriver.Breakpoint = {
      id: breakpointInFoo.id,
      location: breakpointInFoo.location
    } as stackdriver.Breakpoint;
    api.set(bp, (err1) => {
      assert.ifError(err1);
      api.wait(bp, (err2?: Error) => {
        assert.ifError(err2);
        // TODO: The function supplied to reduce is of the wrong type.
        //       Fix this.
        assert(bp.variableTable.reduce(
            (acc: Function|stackdriver.Variable|null,
             elem: stackdriver.Variable|null) => {
              return acc &&
                  (!elem!.status ||
                   elem!.status!.description.format !==
                       'Max data size reached') as {} as stackdriver.Variable;
            }));
        api.clear(bp, (err3) => {
          config.capture.maxDataSize = oldMaxData;
          assert.ifError(err3);
          done();
        });
      });
      process.nextTick(() => {
        foo(2);
      });
    });
  });
});
