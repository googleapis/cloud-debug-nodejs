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
import {Debuglet} from '../src/agent/debuglet';
import * as scanner from '../src/agent/io/scanner';
import * as SourceMapper from '../src/agent/io/sourcemapper';
import * as debugapi from '../src/agent/v8/debugapi';
import consoleLogLevel = require('console-log-level');
import * as stackdriver from '../src/types/stackdriver';


const code = require('./test-evaluated-expressions-code.js');

describe('debugger provides useful information', () => {
  let api: debugapi.DebugApi;
  const config =
      extend({}, defaultConfig, {allowExpressions: true, forceNewAgent_: true});

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

  function getValue(
      exp: stackdriver.Variable,
      varTable: Array<stackdriver.Variable|null>): string|null|undefined {
    if ('value' in exp) {
      return exp.value;
    }

    if ('varTableIndex' in exp) {
      const index = exp.varTableIndex!;
      const val = varTable[index];
      if (!val) {
        return val;
      }
      return getValue(val, varTable);
    }

    throw new Error(
        `The variable ${JSON.stringify(exp, null, 2)} ` +
        `does not have a 'value' nor a 'varTableIndex' property`);
  }

  function assertValue(
      bp: stackdriver.Breakpoint, targetIndex: number, expectedName: string,
      expectedValue: string) {
    const rawExp = bp.evaluatedExpressions[targetIndex];
    assert(rawExp);

    const exp = rawExp!;
    assert.strictEqual(exp.name, expectedName);
    assert.strictEqual(getValue(exp, bp.variableTable), expectedValue);
  }

  function assertMembers(
      bp: stackdriver.Breakpoint, targetIndex: number, expectedName: string,
      expectedMemberValues: stackdriver.Variable[]) {
    const rawExp = bp.evaluatedExpressions[targetIndex];
    assert(rawExp);

    const exp = rawExp!;
    assert.strictEqual(exp.name, expectedName);

    const rawIndex = exp.varTableIndex;
    assert.notStrictEqual(rawIndex, undefined);

    const index = rawIndex!;
    const rawVarData = bp.variableTable[index];
    assert.notStrictEqual(rawVarData, undefined);

    const varData = rawVarData!;
    const memberMap = new Map<string, string|null|undefined>();
    assert.notStrictEqual(varData.members, undefined);
    for (const member of varData.members!) {
      assert.notStrictEqual(member.name, undefined);
      const name = member.name!;
      assert(!memberMap.has(name));
      memberMap.set(name, getValue(member, bp.variableTable));
    }

    for (const member of expectedMemberValues) {
      const rawName = member.name;
      assert.notStrictEqual(rawName, undefined);
      const expected = member.value;
      assert.notStrictEqual(
          expected, undefined,
          'Each expected member must have its value specified');
      const actual = memberMap.get(rawName!);
      assert.deepStrictEqual(
          actual, expected,
          `Expected ${rawName} to have value ${expected} but found ${actual}`);
    }
  }

  it(`should provide data about plain objects`, done => {
    const bp: stackdriver.Breakpoint = {
      id: 'fake-id-123',
      location:
          {path: 'build/test/test-evaluated-expressions-code.js', line: 19},
      expressions: ['someObject']
    } as stackdriver.Breakpoint;

    api.set(bp, err => {
      assert.ifError(err);
      api.wait(bp, err => {
        assert.ifError(err);

        assertMembers(bp, 0, 'someObject', [
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
          {path: 'build/test/test-evaluated-expressions-code.js', line: 19},
      expressions: ['someArray']
    } as stackdriver.Breakpoint;

    api.set(bp, err => {
      assert.ifError(err);
      api.wait(bp, err => {
        assert.ifError(err);

        assertMembers(bp, 0, 'someArray', [
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
        assertValue(bp, 0, 'someRegex', '/abc+/');
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
        assertMembers(bp, 0, 'res', [
          {name: 'readable', value: 'true'}, {name: '_eventsCount', value: '0'},
          {name: '_maxListeners', value: 'undefined'},
          {name: 'complete', value: 'false'}, {name: 'url', value: ''},
          {name: 'statusCode', value: '200'},
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
