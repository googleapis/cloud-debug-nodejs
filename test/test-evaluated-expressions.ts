/**
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from 'assert';
import * as extend from 'extend';

import {defaultConfig} from '../src/agent/config';
import * as scanner from '../src/agent/io/scanner';
import * as SourceMapper from '../src/agent/io/sourcemapper';
import * as debugapi from '../src/agent/v8/debugapi';
import {Common, LoggerOptions} from '../src/types/common';
import * as stackdriver from '../src/types/stackdriver';

const common: Common = require('@google-cloud/common');

const code = require('./test-evaluated-expressions-code.js');

describe('debugger provides useful information', () => {
  let api: debugapi.DebugApi;
  const config =
      extend({}, defaultConfig, {allowExpressions: true, forceNewAgent_: true});

  before(done => {
    // TODO: It appears `logLevel` is a typo and should be `level`.  However,
    //       with this change, the tests fail.  Resolve this.
    const logger =
        new common.logger({levelLevel: config.logLevel} as {} as LoggerOptions);
    scanner.scan(true, config.workingDirectory, /.js$/).then(fileStats => {
      const jsStats = fileStats.selectStats(/.js$/);
      const mapFiles = fileStats.selectFiles(/.map$/, process.cwd());
      SourceMapper.create(mapFiles, (err, mapper) => {
        assert(!err);

        // TODO: Handle the case when mapper is undefined
        // TODO: Handle the case when v8debugapi.create returns null
        api = debugapi.create(
                  logger, config, jsStats,
                  mapper as SourceMapper.SourceMapper) as debugapi.DebugApi;
        done();
      });
    });
  });

  function xor(a: boolean, b: boolean): boolean {
    return (a || b) && !(a && b);
  }

  function assertVariable(
      bp: stackdriver.Breakpoint, targetIndex: number, expectedName: string,
      expectedMembers: stackdriver.Variable[]) {
    const rawExp = bp.evaluatedExpressions[targetIndex];
    assert(rawExp);

    const exp = rawExp!;
    assert.strictEqual(exp.name, expectedName);

    const hasValue = 'value' in exp;
    const hasIndex = 'varTableIndex' in exp;
    assert(xor(hasValue, hasIndex));

    if (hasValue) {
      assert.strictEqual(
          expectedMembers.length, 1,
          'A value should only have one member for the value itself');
      const member = expectedMembers[0];
      assert.strictEqual(exp.name, member.name);
      assert.strictEqual(exp.value, member.value);
      return;
    }

    const rawIndex = exp.varTableIndex;
    assert.notStrictEqual(rawIndex, undefined);

    const index = rawIndex!;
    const rawVarData = bp.variableTable[index];
    assert.notStrictEqual(rawVarData, undefined);

    const varData = rawVarData!;
    if ('value' in varData) {
      assert.strictEqual(expectedMembers.length, 1);
      assert.strictEqual(varData.value, expectedMembers[0].value);
      return;
    }

    const memberMap = new Map<string, stackdriver.Variable>();
    assert.notStrictEqual(varData.members, undefined);
    for (const member of varData.members!) {
      assert.notStrictEqual(member.name, undefined);
      const name = member.name!;
      assert(!memberMap.has(name));
      memberMap.set(name, member);
    }

    for (const member of expectedMembers) {
      const rawName = member.name;
      assert.notStrictEqual(rawName, undefined);
      const name = rawName!;
      assert.deepEqual(memberMap.get(name), member);
    }
  }

  it(`should provide data about plain objects`, done => {
    const bp: stackdriver.Breakpoint = {
      id: 'fake-id-123',
      location:
          {path: 'build/test/test-evaluated-expressions-code.js', line: 17},
      expressions: ['someObject']
    } as stackdriver.Breakpoint;

    api.set(bp, err => {
      assert.ifError(err);
      api.wait(bp, err => {
        assert.ifError(err);

        assertVariable(bp, 0, 'someObject', [
          {name: 'aNumber', value: '1'},
          {name: 'aString', value: 'some string'}
        ]);

        api.clear(bp, err => {
          assert.ifError(err);
          done();
        });
      });
      process.nextTick(() => code.foo());
    });
  });

  it(`should provide data about arrays`, done => {
    const bp: stackdriver.Breakpoint = {
      id: 'fake-id-123',
      location:
          {path: 'build/test/test-evaluated-expressions-code.js', line: 18},
      expressions: ['someArray']
    } as stackdriver.Breakpoint;

    api.set(bp, err => {
      assert.ifError(err);
      api.wait(bp, err => {
        assert.ifError(err);

        assertVariable(bp, 0, 'someArray', [
          {name: '0', value: '1'}, {name: '1', value: '2'},
          {name: '2', value: '3'}, {name: 'length', value: '3'}
        ]);

        api.clear(bp, err => {
          assert.ifError(err);
          done();
        });
      });
      process.nextTick(() => code.foo());
    });
  });

  it(`should provide data about regexes`, done => {
    const bp: stackdriver.Breakpoint = {
      id: 'fake-id-123',
      location:
          {path: 'build/test/test-evaluated-expressions-code.js', line: 19},
      expressions: ['someRegex']
    } as stackdriver.Breakpoint;

    api.set(bp, err => {
      assert.ifError(err);
      api.wait(bp, err => {
        assert.ifError(err);
        assertVariable(
            bp, 0, 'someRegex', [{name: 'someRegex', value: '/abc+/'}]);
        api.clear(bp, err => {
          assert.ifError(err);
          done();
        });
      });
      process.nextTick(() => code.foo());
    });
  });

  it(`should provide data about responses`, done => {
    const bp: stackdriver.Breakpoint = {
      id: 'fake-id-123',
      location:
          {path: 'build/test/test-evaluated-expressions-code.js', line: 19},
      expressions: ['res']
    } as stackdriver.Breakpoint;

    api.set(bp, err => {
      assert.ifError(err);
      api.wait(bp, err => {
        assert.ifError(err);
        assertVariable(bp, 0, 'res', [
          {name: 'readable', value: 'true'},
          //{name: 'domain', value: 'null'},
          {name: '_eventsCount', value: '0'},
          {name: '_maxListeners', value: 'undefined'},
          //{name: 'httpVersionMajor', value: 'null'},
          //{name: 'httpVersionMinor', value: 'null'},
          //{name: 'httpVersion', value: 'null'},
          {name: 'complete', value: 'false'},
          //{name: 'upgrade', value: 'null'},
          {name: 'url', value: ''},
          //{name: 'method', value: 'null'},
          {name: 'statusCode', value: '200'},
          //{name: 'statusMessage', value: 'null'},
          {name: '_consuming', value: 'false'},
          {name: '_dumped', value: 'false'}
        ]);
        api.clear(bp, err => {
          assert.ifError(err);
          done();
        });
      });
      process.nextTick(() => code.foo());
    });
  });
});
