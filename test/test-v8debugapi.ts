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

import * as apiTypes from '../src/types/api-types';
import {V8DebugApi} from '../src/agent/v8debugapi';
import {DebugAgentConfig} from '../src/agent/config';

// TODO: Have this actually implement Breakpoint
const breakpointInFoo: apiTypes.Breakpoint = {
  id: 'fake-id-123',
  // TODO: Determine if we should be restricting to only the build directory.
  location: { path: 'build/test/test-v8debugapi-code.js', line: 4 }
} as apiTypes.Breakpoint;

const MAX_INT = 2147483647; // Max signed int32.

import * as commonTypes from '../src/types/common-types';

import * as assert from 'assert';
import * as extend from 'extend';
import * as v8debugapi from '../src/agent/v8debugapi';
const common: commonTypes.Common = require('@google-cloud/common');
import defaultConfig from '../src/agent/config';
import {StatusMessage} from '../src/status-message';
import * as scanner from '../src/agent/scanner';
import * as SourceMapper from '../src/agent/sourcemapper';
import * as path from 'path';
import * as semver from 'semver';
const code = require('./test-v8debugapi-code.js');

function stateIsClean(api: V8DebugApi): boolean {
  assert.equal(api.numBreakpoints_(), 0,
    'there should be no breakpoints active');
  assert.equal(api.numListeners_(), 0,
    'there should be no listeners active');
  return true;
}

function validateVariable(variable: apiTypes.Variable): void {
  if (variable.name) {
    assert.equal(typeof variable.name, 'string');
  }
  if (variable.value) {
    assert.equal(typeof variable.value, 'string');
  }
  if (variable.type) {
    assert.equal(typeof variable.type, 'string');
  }
  if (variable.members) {
    variable.members.forEach(validateVariable);
  }
  if (variable.varTableIndex) {
    assert.ok(Number.isInteger(variable.varTableIndex) &&
              variable.varTableIndex >= 0 &&
              variable.varTableIndex <= MAX_INT);
  }
}

function validateSourceLocation(location: apiTypes.SourceLocation): void {
  if (location.path) {
    assert.equal(typeof location.path, 'string');
  }
  if (location.line) {
    assert.ok(Number.isInteger(location.line) &&
              location.line >= 1 &&
              location.line <= MAX_INT);
  }
}

function validateStackFrame(frame: apiTypes.StackFrame): void {
  if (frame['function']) {
    assert.equal(typeof frame['function'], 'string');
  }
  if (frame.location) {
    validateSourceLocation(frame.location);
  }
  if (frame.arguments) {
    frame.arguments.forEach(validateVariable);
  }
  if (frame.locals) {
    frame.locals.forEach(validateVariable);
  }
}

function validateBreakpoint(breakpoint: apiTypes.Breakpoint): void {
  if (!breakpoint) {
    return;
  }
  if (breakpoint.variableTable) {
    breakpoint.variableTable.forEach(validateVariable);
  }
  if (breakpoint.evaluatedExpressions) {
    breakpoint.evaluatedExpressions.forEach(validateVariable);
  }
  if (breakpoint.stackFrames) {
    breakpoint.stackFrames.forEach(validateStackFrame);
  }
}

describe('v8debugapi', function() {
  const config: DebugAgentConfig = extend({}, defaultConfig, {
    workingDirectory: __dirname,
    forceNewAgent_: true
  });
  // TODO: It appears `logLevel` is a typo and should be `level`.  However,
  //       with this change, the tests fail.  Resolve this.
  const logger = new common.logger({ levelLevel: config.logLevel } as any as commonTypes.LoggerOptions);
  let api: V8DebugApi|null = null;

  beforeEach(function(done) {
    if (!api) {
      scanner.scan(true, config.workingDirectory, /.js$|.map$/)
        .then(function (fileStats) {
          const jsStats = fileStats.selectStats(/.js$/);
          const mapFiles = fileStats.selectFiles(/.map$/, process.cwd());
          SourceMapper.create(mapFiles, function (err, mapper) {
            assert(!err);

            api = v8debugapi.create(logger, config, jsStats, mapper);
            assert.ok(api, 'should be able to create the api');

            // monkey-patch wait to add validation of the breakpoints.
            const origWait = api.wait;
            api.wait = function (bp, callback) {
              origWait(bp, function (err) {
                validateBreakpoint(bp);
                callback(err);
              });
            };
            done();
          });
        });
    } else {
      assert(stateIsClean(api));
      done();
    }
  });
  afterEach(function() { assert(stateIsClean(api)); });

  it('should be able to set and remove breakpoints', function(done) {
    // clone a clean breakpointInFoo
    // TODO: Have this actually implement Breakpoint
    const bp: apiTypes.Breakpoint = {id: breakpointInFoo.id, location: breakpointInFoo.location} as apiTypes.Breakpoint;
    api.set(bp, function(err) {
      assert.ifError(err);
      assert.equal(api.numBreakpoints_(), 1);
      api.clear(bp);
      done();
    });
  });

  it('should accept breakpoint with ids 0 as a valid breakpoint',
    function(done) {
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint = { id: 0, location: breakpointInFoo.location} as any as apiTypes.Breakpoint;
      api.set(bp, function(err) {
        assert.ifError(err);
        api.clear(bp);
        done();
      });
    });

  it('should set error for breakpoint in non-js files',
    function(done) {
      require('./fixtures/key-bad.json');
      // TODO: Have this actually implement Breakpoint
      const bp = { id: 0, location: {line: 1, path: path.join('fixtures',
        'key-bad.json')}} as any as apiTypes.Breakpoint;
      api.set(bp, function(err) {
        assert.ok(err, 'should return an error');
        assert.ok(bp.status);
        assert.ok(bp.status instanceof StatusMessage);
        assert.equal(bp.status.refersTo, 'BREAKPOINT_SOURCE_LOCATION');
        assert.ok(bp.status.isError);
        done();
      });
    });

  it('should disambiguate incorrect path if filename is unique',
    function(done) {
      require('./fixtures/foo.js');
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint = { id: 0, location: {line: 1, path: path.join(path.sep, 'test',
        'foo.js')}} as any as apiTypes.Breakpoint;
      api.set(bp, function(err) {
        assert.ifError(err);
        api.clear(bp);
        done();
      });
    });

  it('should disambiguate incorrect path if partial path is unique',
    function(done) {
      require('./fixtures/foo.js');
      // hello.js is not unique but a/hello.js is.
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint = { id: 0, location: {line: 1, path: path.join(path.sep, 'Server',
        'a', 'hello.js')}} as any as apiTypes.Breakpoint;
      api.set(bp, function(err) {
        assert.ifError(err);
        api.clear(bp);
        done();
      });
    });

  describe('invalid breakpoints', function() {
    // TODO: Have this actually be a list of Breakpoints
    const badBreakpoints: apiTypes.Breakpoint[] = [
      {} as any as apiTypes.Breakpoint,
      { id: 'with no location'} as any as apiTypes.Breakpoint,
      { id: 'with bad location', location: {}} as any as apiTypes.Breakpoint,
      { id: 'with no path', location: {line: 4}} as any as apiTypes.Breakpoint,
      { id: 'with no line', location: {path: 'foo.js'}} as any as apiTypes.Breakpoint,
      { id: 'with incomplete path', location: {path: 'st-v8debugapi.js', line: 4}} as any as apiTypes.Breakpoint
    ];

    badBreakpoints.forEach(function(bp: apiTypes.Breakpoint) {
      it('should reject breakpoint ' + bp.id, function(done) {
        api.set(bp, function(err) {
          assert.ok(err, 'should return an error');
          assert.ok(bp.status);
          assert.ok(bp.status instanceof StatusMessage);
          assert.ok(bp.status.isError);
          done();
        });

      });
    });

    it('should reject breakpoint when filename is ambiguous', function(done) {
      require('./fixtures/a/hello.js');
      require('./fixtures/b/hello.js');
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint = {id: 'ambiguous', location: {line: 1, path: 'hello.js'}} as any as apiTypes.Breakpoint;
      api.set(bp, function(err) {
        assert.ok(err);
        assert.ok(bp.status);
        assert.ok(bp.status instanceof StatusMessage);
        assert.ok(bp.status.isError);
        assert(bp.status.description.format ===
          api.messages.SOURCE_FILE_AMBIGUOUS);
        done();
      });
    });

    it('should reject breakpoint on non-existent line', function(done) {
      require('./fixtures/foo.js');
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint = {
        id: 'non-existent line',
        location: {path: path.join('fixtures', 'foo.js'), line: 500}
      } as any as apiTypes.Breakpoint;
      api.set(bp, function(err) {
        assert.ok(err);
        assert.ok(bp.status);
        assert.ok(bp.status instanceof StatusMessage);
        assert.ok(bp.status.isError);
        assert(bp.status.description.format.match(
          `${api.messages.INVALID_LINE_NUMBER}.*foo.js:500`));
        done();
      });
    });

  });

  function conditionTests(subject: string, test: (err: Error) => void, expressions: Array<string|null>) {
    describe(subject, function() {
      expressions.forEach(function(expr) {
        it('should validate breakpoint with condition "'+expr+'"', function(done) {
          // make a clean copy of breakpointInFoo
          // TODO: Have this actually implement Breakpoint
          const bp: apiTypes.Breakpoint = {
            id: breakpointInFoo.id,
            location: breakpointInFoo.location,
            condition: expr
          } as any as apiTypes.Breakpoint;
          api.set(bp, function(err) {
            test(err);
            api.clear(bp);
            done();
          });
        });
      });
    });
  }
  conditionTests('invalid conditions', assert, [
    // syntax errors
    '*',
    'j+',
    'break',
    ':)',

    // mutability
    'x = 1',
    'const x = 1;',
    'console.log(1)',
    'while (true) ;',
    'return 3',
    'throw new Error()',
    'new Error()',
    'try { 1 }',
    'let me_pass = 1',
    'debugger',
    'function newfunction() { 1 }',
    '{ f: fib(3) }',
    'function () { 1 }',
    '() => { 1 }',
    '1, 2, 3, fib(), 4',
    '!fib()',
    '1+fib()',
    'x++',
    '[1, 2, 3, 4, x = 1, x == 1, x === 1]',
    '[0].values()',
    'new Object()',
  ]);
  conditionTests('valid conditions', function(err) { assert.ifError(err); }, [
    null,
    '',
    ';',
    'x == 1',
    'x === 1',
    'global <= 1',
    'this + 1',
    '!this',
    'this?this:1',
    '{f: this?1:2}',
    '{f: process.env}',
    '1,2,3,{f:2},4',
    'A[this?this:1]',
    '[1, 2, 3, 4, x == 1, x === 1, null, undefined]',
    '[0].values',
    '[][0]',
    '[0][' + MAX_INT + ']',
    '"𠮷".length + (5| "𠮷")',
    '/ٹوٹ بٹوٹ کے دو مُرغے تھے/',
  ]);

  if (semver.satisfies(process.version, '>=4.0')) {
    conditionTests('invalid conditions Node 4+', assert, [
      '[][Symbol.iterator]()',
      '`${[][Symbol.iterator]()}`',
      '`${let x = 1}`',
      '`${JSON.parse("{x:1}")}`',
      '`${try {1}}`'
    ]);
    conditionTests('valid conditions Node 4+', function(err) {
      assert.ifError(err);
    }, [
      '[][Symbol.iterator]',
      '[..."peanut butter"]',
      '[0,...[1,2,"foo"]]',
      '`${1}`',
      '`${[][1+1]}`',
      '0b10101010',
      '0o70000',
      // Disabled because of suspect acorn issues?
      // https://tonicdev.com/575b00351a0e0a1300505d00/575b00351a0e0a1300505d01
      //'{["foo"]: 1}',
      //'{ foo (a,b) {}}'
    ]);
  }

  describe('path normalization', function() {
    // TODO: Have this actually be a list of Breakpoints
    const breakpoints = [
      { id: 'path0', location: {line: 4, path: path.join(path.sep, 'test',
        'test-v8debugapi-code.js')}} as any as apiTypes.Breakpoint,
      { id: 'path1', location: {line: 4, path: path.join('test',
        'test-v8debugapi-code.js')}} as any as apiTypes.Breakpoint,
      { id: 'path2', location: {line: 4, path:
        // Usage the absolute path to `test-v8debugapi-code.js`.
        __filename.split(path.sep).slice(0, -1).concat('test-v8debugapi-code.js').join(path.sep)
      }} as any as apiTypes.Breakpoint,
      { id: 'with . in path', location: {path: path.join('test', '.',
        'test-v8debugapi-code.js'), line: 4}} as any as apiTypes.Breakpoint,
      { id: 'with . in path', location: {path: path.join('.',
        'test-v8debugapi-code.js'), line: 4}} as any as apiTypes.Breakpoint,
      { id: 'with .. in path', location: {path: path.join('test', '..',
        'test-v8debugapi-code.js'), line: 4}} as any as apiTypes.Breakpoint,
      { id: 'with .. in path', location: {path: path.join('..', 'test',
        'test-v8debugapi-code.js'), line: 4}} as any as apiTypes.Breakpoint
    ];

    breakpoints.forEach(function(bp: apiTypes.Breakpoint) {
      it('should handle breakpoint as ' + bp.location.path, function(done) {
        api.set(bp, function(err) {
          assert.ifError(err);
          api.wait(bp, function(err) {
            assert.ifError(err);
            api.clear(bp);
            done();
          });
          process.nextTick(function() {code.foo(7);});
        });
      });
    });
  });

  describe('log', function() {
    let oldLPS: number;
    let oldDS: number;

    before(function() {
      oldLPS = config.log.maxLogsPerSecond;
      oldDS = config.log.logDelaySeconds;
      config.log.maxLogsPerSecond = 1;
      config.log.logDelaySeconds = 1;
    });

    after(function() {
      config.log.maxLogsPerSecond = oldLPS;
      config.log.logDelaySeconds = oldDS;
      assert(stateIsClean(api));
    });

    it('should throttle correctly', function(done) {
      let completed = false;
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint = {
        id: breakpointInFoo.id,
        location: breakpointInFoo.location,
        action: 'LOG',
        logMessageFormat: 'cat'
      } as any as apiTypes.Breakpoint;
      api.set(bp, function(err) {
        let transcript = '';
        let runCount = 0;
        assert.ifError(err);
        api.log(bp, function(fmt) { transcript += fmt; },
          function() { return completed; });
        const interval = setInterval(function() {
          code.foo(1);
          runCount++;
        }, 100);
        setTimeout(function() {
          completed = true;
          assert.equal(transcript, 'catcat');
          assert(runCount > 12);
          clearInterval(interval);
          api.clear(bp);
          done();
        }, 1500);
      });
    });
  });

  describe('set and wait', function() {

    it('should be possible to wait on a breakpoint', function(done) {
      // clone a clean breakpointInFoo
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint = {id: breakpointInFoo.id, location: breakpointInFoo.location} as any as apiTypes.Breakpoint;
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);
          api.clear(bp);
          done();
        });
        process.nextTick(function() {code.foo(1);});
      });

    });

    it('should work with multiply hit breakpoints', function(done) {
      const oldWarn = logger.warn;
      let logCount = 0;
      // If an exception is thrown we will log
      logger.warn = function() { logCount++; };
      // clone a clean breakpointInFoo
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint = {id: breakpointInFoo.id, location: breakpointInFoo.location} as any as apiTypes.Breakpoint;
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);
          setTimeout(function() {
            logger.warn = oldWarn;
            assert.equal(logCount, 0);
            api.clear(bp);
            done();
          }, 100);
        });
        process.nextTick(function() {code.foo(1);});
        setTimeout(function() {code.foo(2);}, 50);
      });
    });

    it('should be possible to wait on a logpoint without expressions',
        function(done) {
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint = {
        id: breakpointInFoo.id,
        action: 'LOG',
        logMessageFormat: 'Hello World',
        location: breakpointInFoo.location
      } as any as apiTypes.Breakpoint;
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);
          api.clear(bp);
          done();
        });
        process.nextTick(function() {code.foo(1);});
      });

    });

    it('should capture state', function(done) {
      // clone a clean breakpointInFoo
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint  = {id: breakpointInFoo.id, location: breakpointInFoo.location} as any as apiTypes.Breakpoint;
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);
          assert.ok(bp.stackFrames);
          assert.ok(bp.variableTable);

          const topFrame = bp.stackFrames[0];
          assert.ok(topFrame);
          assert.equal(topFrame['function'], 'foo');
          assert.equal(topFrame.locals[0].name, 'n');
          assert.equal(topFrame.locals[0].value, '2');
          assert.equal(topFrame.locals[1].name, 'A');
          assert.equal(topFrame.locals[2].name, 'B');
          api.clear(bp);
          done();
        });
      process.nextTick(function() {code.foo(2);});
      });
    });

    it('should resolve correct frame count', function(done) {
      // clone a clean breakpointInFoo
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint  = {id: breakpointInFoo.id, location: breakpointInFoo.location} as any as apiTypes.Breakpoint;
      const oldCount = config.capture.maxExpandFrames;
      config.capture.maxExpandFrames = 0;
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);
          assert.ok(bp.stackFrames);
          assert.ok(bp.variableTable);
          const topFrame = bp.stackFrames[0];
          assert.ok(topFrame);
          assert.equal(topFrame['function'], 'foo');
          assert.equal(topFrame.arguments.length, 1);
          const argsVal = bp.variableTable[topFrame.arguments[0].varTableIndex];
          assert(argsVal.status.isError);
          assert(argsVal.status.description.format.match(
            'Locals and arguments are only displayed.*config.capture.maxExpandFrames=0'
            ));
          assert.equal(topFrame.locals.length, 1);
          const localsVal = bp.variableTable[topFrame.locals[0].varTableIndex];
          assert(localsVal.status.isError);
          assert(localsVal.status.description.format.match(
            'Locals and arguments are only displayed.*config.capture.maxExpandFrames=0'
            ));
          api.clear(bp);
          config.capture.maxExpandFrames = oldCount;
          done();
        });
      process.nextTick(function() {code.foo(2);});
      });
    });

    it('should capture correct frame count', function(done) {
      // clone a clean breakpointInFoo
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint  = {id: breakpointInFoo.id, location: breakpointInFoo.location} as any as apiTypes.Breakpoint;
      const oldMax = config.capture.maxFrames;
      config.capture.maxFrames = 1;
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);
          assert.ok(bp.stackFrames);
          assert.equal(bp.stackFrames.length, config.capture.maxFrames);
          const topFrame = bp.stackFrames[0];
          assert.ok(topFrame);
          assert.equal(topFrame['function'], 'foo');
          assert.equal(topFrame.locals[0].name, 'n');
          assert.equal(topFrame.locals[0].value, '2');
          api.clear(bp);
          config.capture.maxFrames = oldMax;
          done();
        });
      process.nextTick(function() {code.foo(2);});
      });
    });

    it('should capture state with watch expressions', function(done) {
      // clone a clean breakpointInFoo
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint = {
        id: breakpointInFoo.id,
        location: breakpointInFoo.location,
        expressions: ['process']
      } as any as apiTypes.Breakpoint;
      const oldMaxProps = config.capture.maxProperties;
      const oldMaxData = config.capture.maxDataSize;
      config.capture.maxProperties = 0;
      config.capture.maxDataSize = 20000;
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);
          assert.ok(bp.stackFrames);
          assert.ok(bp.variableTable);
          assert.ok(bp.evaluatedExpressions);

          const topFrame = bp.stackFrames[0];
          assert.equal(topFrame['function'], 'foo');
          assert.equal(topFrame.locals[0].name, 'n');
          assert.equal(topFrame.locals[0].value, '3');

          const watch = bp.evaluatedExpressions[0];
          assert.equal(watch.name, 'process');
          assert.ok(watch.varTableIndex);

          // Make sure the process object looks sensible.
          const processVal = bp.variableTable[watch.varTableIndex];
          assert.ok(processVal);
          // TODO: The function supplied to the `some` function is of the
          //       wrong type.  Fix this.
          assert.ok(processVal.members.some(function(m: apiTypes.Variable) {
            return m.name === 'nextTick' && m.value.match('function.*');
          } as any));
          // TODO: The function supplied to the `some` function is of the
          //       wrong type.  Fix this.
          assert.ok(processVal.members.some(function(m: apiTypes.Variable) {
            return m.name === 'versions' && m.varTableIndex;
          } as any));

          api.clear(bp);
          config.capture.maxDataSize = oldMaxData;
          config.capture.maxProperties = oldMaxProps;
          done();
        });
        process.nextTick(function() {code.foo(3);});
      });
    });

    it('should report error for native prop or getter', function(done) {
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint = {
        id: 'fake-id-124',
        // TODO: This path can be lest strict when this file has been
        //       converted to Typescript.
        location: { path: 'build/test/test-v8debugapi-code.js', line: 9 },
        expressions: ['process.env', 'hasGetter']
      } as any as apiTypes.Breakpoint;
      const oldMaxData = config.capture.maxDataSize;
      config.capture.maxDataSize = 20000;
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);

          const procEnv = bp.evaluatedExpressions[0];
          assert.equal(procEnv.name, 'process.env');
          const envVal = bp.variableTable[procEnv.varTableIndex];
          envVal.members.forEach(function(member) {
            if (member.hasOwnProperty('varTableIndex')) {
               assert(bp.variableTable[member.varTableIndex].status.isError);
            }
          });
          const hasGetter = bp.evaluatedExpressions[1];
          const getterVal = bp.variableTable[hasGetter.varTableIndex];
          assert(getterVal.members.some(function(m) {
            return m.value === '5';
          }));
          assert(getterVal.members.some(function(m) {
            const resolved = bp.variableTable[m.varTableIndex];
            return resolved && resolved.status.isError;
          }));

          api.clear(bp);
          config.capture.maxDataSize = oldMaxData;
          done();
        });
        process.nextTick(function() {code.getterObject();});
      });
    });

    it('should work with array length despite being native', function(done) {
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint = {
        id: breakpointInFoo.id,
        // TODO: This path can be lest strict when this file has been
        //       converted to Typescript.
        location:  { path: 'build/test/test-v8debugapi-code.js', line: 5 },
        expressions: ['A']
      } as any as apiTypes.Breakpoint;
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);

          const arrEnv = bp.evaluatedExpressions[0];
          assert.equal(arrEnv.name, 'A');
          const envVal = bp.variableTable[arrEnv.varTableIndex];
          let found = false;
          envVal.members.forEach(function(member) {
            if (member.name === 'length') {
              assert(!member.varTableIndex);
              assert.equal(member.value, 3);
              found = true;
            }
          });
          assert(found);

          api.clear(bp);
          done();
        });
        process.nextTick(function() {code.foo();});
      });
    });

    it('should limit string length', function(done) {
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint = {
        id: 'fake-id-124',
        // TODO: This path can be lest strict when this file has been
        //       converted to Typescript.
        location: { path: 'build/test/test-v8debugapi-code.js', line: 9 }
      } as any as apiTypes.Breakpoint;
      const oldMaxLength = config.capture.maxStringLength;
      const oldMaxData = config.capture.maxDataSize;
      config.capture.maxStringLength = 3;
      config.capture.maxDataSize = 20000;
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);
          const hasGetter = bp.stackFrames[0].locals.filter(function(value) {
            return value.name === 'hasGetter';
          });
          const getterVal = bp.variableTable[hasGetter[0].varTableIndex];
          const stringItems = getterVal.members.filter(function(m) {
            return m.value === 'hel...';
          });
          assert(stringItems.length === 1);

          const item = stringItems[0];
          assert(item.status.description.format.match(
            'Only first.*config.capture.maxStringLength=3.*of length 11.'));
          api.clear(bp);
          config.capture.maxDataSize = oldMaxData;
          config.capture.maxStringLength = oldMaxLength;
          done();
        });
        process.nextTick(function() {code.getterObject();});
      });
    });

    it('should limit array length', function(done) {
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint = {
        id: 'fake-id-124',
        // TODO: This path can be lest strict when this file has been
        //       converted to Typescript.
        location: { path: 'build/test/test-v8debugapi-code.js', line: 5 }
      } as any as apiTypes.Breakpoint;
      const oldMax = config.capture.maxProperties;
      config.capture.maxProperties = 1;
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);
          const aResults = bp.stackFrames[0].locals.filter(function(value) {
            return value.name === 'A';
          });
          const aVal = bp.variableTable[aResults[0].varTableIndex];
          // should have 1 element + truncation message.
          assert.equal(aVal.members.length, 2);
          assert(aVal.members[1].name.match(
            'Only first.*config.capture.maxProperties=1'));

          api.clear(bp);
          config.capture.maxProperties = oldMax;
          done();
        });
        process.nextTick(function() {code.foo(2);});
      });
    });

    it('should limit object length', function(done) {
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint = {
        id: 'fake-id-124',
        // TODO: This path can be lest strict when this file has been
        //       converted to Typescript.
        location: { path: 'build/test/test-v8debugapi-code.js', line: 5 }
      } as any as apiTypes.Breakpoint;
      const oldMax = config.capture.maxProperties;
      config.capture.maxProperties = 1;
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);
          const bResults = bp.stackFrames[0].locals.filter(function(value) {
            return value.name === 'B';
          });
          const bVal = bp.variableTable[bResults[0].varTableIndex];
          // should have 1 element + truncation message
          assert.equal(bVal.members.length, 2);
          assert(bVal.members[1].name.match(
            'Only first.*config.capture.maxProperties=1'));

          api.clear(bp);
          config.capture.maxProperties = oldMax;
          done();
        });
        process.nextTick(function() {code.foo(2);});
      });
    });

    it('should not limit the length of an evaluated string based on maxStringLength',
        function(done) {
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint = {
        id: 'fake-id-124',
        // TODO: This path can be lest strict when this file has been
        //       converted to Typescript.
        location: { path: 'build/test/test-v8debugapi-code.js', line: 9 },
        expressions: ['hasGetter']
      } as any as apiTypes.Breakpoint;
      const oldMaxLength = config.capture.maxStringLength;
      const oldMaxData = config.capture.maxDataSize;
      config.capture.maxStringLength = 3;
      config.capture.maxDataSize = 20000;
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);
          const hasGetter = bp.evaluatedExpressions[0];
          const getterVal = bp.variableTable[hasGetter.varTableIndex];
          const stringItems = getterVal.members.filter(function(m) {
            return m.value === 'hello world';
          });
          // The property would have value 'hel...' if truncation occured
          // resulting in stringItems.length being 0.
          assert(stringItems.length === 1);

          api.clear(bp);
          config.capture.maxDataSize = oldMaxData;
          config.capture.maxStringLength = oldMaxLength;
          done();
        });
        process.nextTick(function() {code.getterObject();});
      });
    });

    it('should not limit the length of an evaluated array based on maxProperties',
      function(done) {
        // TODO: Have this actually implement Breakpoint
        const bp: apiTypes.Breakpoint = {
          id: 'fake-id-124',
          // TODO: This path can be lest strict when this file has been
          //       converted to Typescript.
          location: { path: 'build/test/test-v8debugapi-code.js', line: 5 },
          expressions: ['A']
        } as any as apiTypes.Breakpoint;
        const oldMaxProps = config.capture.maxProperties;
        const oldMaxData = config.capture.maxDataSize;
        config.capture.maxProperties = 1;
        config.capture.maxDataSize = 20000;
        api.set(bp, function(err) {
          assert.ifError(err);
          api.wait(bp, function(err) {
            assert.ifError(err);
            const foo = bp.evaluatedExpressions[0];
            const fooVal = bp.variableTable[foo.varTableIndex];
            // '1', '2', '3', and 'length'
            assert.equal(fooVal.members.length, 4);
            assert.strictEqual(foo.status, undefined);

            api.clear(bp);
            config.capture.maxDataSize = oldMaxData;
            config.capture.maxProperties = oldMaxProps;
            done();
          });
          process.nextTick(function() {code.foo(2);});
        });
    });

    it('should not limit the length of an evaluated object based on maxProperties',
      function(done) {
        // TODO: Have this actually implement Breakpoint
        const bp: apiTypes.Breakpoint = {
          id: 'fake-id-124',
          // TODO: This path can be lest strict when this file has been
          //       converted to Typescript.
          location: { path: 'build/test/test-v8debugapi-code.js', line: 5 },
          expressions: ['B']
        } as any as apiTypes.Breakpoint;
        const oldMaxProps = config.capture.maxProperties;
        const oldMaxData = config.capture.maxDataSize;
        config.capture.maxProperties = 1;
        config.capture.maxDataSize = 20000;
        api.set(bp, function(err) {
          assert.ifError(err);
          api.wait(bp, function(err) {
            assert.ifError(err);
            const foo = bp.evaluatedExpressions[0];
            const fooVal = bp.variableTable[foo.varTableIndex];
            assert.equal(fooVal.members.length, 3);
            assert.strictEqual(foo.status, undefined);

            api.clear(bp);
            config.capture.maxDataSize = oldMaxData;
            config.capture.maxProperties = oldMaxProps;
            done();
          });
          process.nextTick(function() {code.foo(2);});
        });
    });

    it('should display an error for an evaluated array beyond maxDataSize',
      function(done) {
        // TODO: Have this actually implement Breakpoint
        const bp: apiTypes.Breakpoint = {
          id: 'fake-id-124',
          // TODO: This path can be lest strict when this file has been
          //       converted to Typescript.
          location: { path: 'build/test/test-v8debugapi-code.js', line: 5 },
          expressions: ['A']
        } as any as apiTypes.Breakpoint;
        const oldMaxProps = config.capture.maxProperties;
        const oldMaxData = config.capture.maxDataSize;
        config.capture.maxProperties = 5;
        config.capture.maxDataSize = 1;
        api.set(bp, function(err) {
          assert.ifError(err);
          api.wait(bp, function(err) {
            assert.ifError(err);
            const foo = bp.evaluatedExpressions[0];
            const fooVal = bp.variableTable[foo.varTableIndex];
            assert(fooVal.status.description.format.match(
              'Max data size reached'));
            assert(fooVal.status.isError);

            api.clear(bp);
            config.capture.maxDataSize = oldMaxData;
            config.capture.maxProperties = oldMaxProps;
            done();
          });
          process.nextTick(function() {code.foo(2);});
        });
    });

    it('should display an error for an evaluated object beyond maxDataSize',
      function(done) {
        // TODO: Have this actually implement Breakpoint
        const bp: apiTypes.Breakpoint = {
          id: 'fake-id-124',
          // TODO: This path can be lest strict when this file has been
          //       converted to Typescript.
          location: { path: 'build/test/test-v8debugapi-code.js', line: 5 },
          expressions: ['B']
        } as any as apiTypes.Breakpoint;
        const oldMaxProps = config.capture.maxProperties;
        const oldMaxData = config.capture.maxDataSize;
        config.capture.maxProperties = 5;
        config.capture.maxDataSize = 1;
        api.set(bp, function(err) {
          assert.ifError(err);
          api.wait(bp, function(err) {
            assert.ifError(err);
            const foo = bp.evaluatedExpressions[0];
            const fooVal = bp.variableTable[foo.varTableIndex];
            assert(fooVal.status.description.format.match(
              'Max data size reached'));
            assert(fooVal.status.isError);

            api.clear(bp);
            config.capture.maxDataSize = oldMaxData;
            config.capture.maxProperties = oldMaxProps;
            done();
          });
          process.nextTick(function() {code.foo(2);});
        });
    });

    it('should set the correct status messages if maxDataSize is reached',
      function(done) {
        // TODO: Have this actually implement Breakpoint
        const bp: apiTypes.Breakpoint = {
          id: 'fake-id-124',
          // TODO: This path can be lest strict when this file has been
          //       converted to Typescript.
          location: { path: 'build/test/test-v8debugapi-code.js', line: 5 },
          expressions: ['A']
        } as any as apiTypes.Breakpoint;
        const oldMaxProps = config.capture.maxProperties;
        const oldMaxData = config.capture.maxDataSize;
        config.capture.maxProperties = 1;
        config.capture.maxDataSize = 1;
        api.set(bp, function(err) {
          assert.ifError(err);
          api.wait(bp, function(err) {
            assert.ifError(err);

            const bResults = bp.stackFrames[0].locals.filter(function(value) {
              return value.name === 'B';
            });
            assert(bResults);
            assert.strictEqual(bResults.length, 1);

            const bArray = bResults[0];
            assert(bArray);
            assert(bArray.status.description.format.match(
              'Max data size reached'));
            assert(bArray.status.isError);

            api.clear(bp);
            config.capture.maxDataSize = oldMaxData;
            config.capture.maxProperties = oldMaxProps;
            done();
          });
          process.nextTick(function() {code.foo(2);});
        });
    });

    it('should capture without values for invalid watch expressions', function(done) {
      // clone a clean breakpointInFoo
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint  = {
        id: breakpointInFoo.id,
        location: breakpointInFoo.location,
        expressions: [':)', 'process()', 'process=this', 'i', 'process._not._def']
      } as any as apiTypes.Breakpoint;
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);
          assert.ok(bp.stackFrames);
          assert.ok(bp.variableTable);
          assert.ok(bp.evaluatedExpressions);

          for (const i in bp.evaluatedExpressions) {
            const expr = bp.evaluatedExpressions[i];
            assert(expr.status && expr.status.isError);
          }

          api.clear(bp);
          done();
        });
        process.nextTick(function() {code.foo(3);});
      });

    });

    it('should be possible to set conditional breakpoints', function (done) {
      // clone a clean breakpointInFoo
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint = {
        id: breakpointInFoo.id,
        location: breakpointInFoo.location,
        condition: 'n===5'
      } as any as apiTypes.Breakpoint;
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);
          assert.ok(bp.stackFrames);

          const topFrame = bp.stackFrames[0];
          assert.equal(topFrame.locals[0].name, 'n');
          assert.equal(topFrame.locals[0].value, '5');
          api.clear(bp);
          done();
        });
        process.nextTick(function() {code.foo(4); code.foo(5);});
      });

    });

    it('should be possible to set conditional breakpoints in coffeescript',
      function (done) {
        // TODO: Have this actually implement Breakpoint
        const bp: apiTypes.Breakpoint = {
          id: 'coffee-id-1729',
          // TODO: Determine if this path should contain 'build'
          location: { path: path.join('.', 'build', 'test', 'fixtures', 'coffee',
            'transpile.coffee'), line: 3 },
          condition: 'if n == 3 then true else false'
        } as any as apiTypes.Breakpoint;
        const tt = require('./fixtures/coffee/transpile');
        api.set(bp, function(err) {
          assert.ifError(err);
          api.wait(bp, function(err) {
            assert.ifError(err);
            assert.ok(bp.stackFrames);

            const topFrame = bp.stackFrames[0];
            assert.equal(topFrame['function'], 'foo');
            assert.equal(topFrame.locals[0].name, 'n');
            assert.equal(topFrame.locals[0].value, '3');
            api.clear(bp);
            done();
          });
          process.nextTick(function() {tt.foo(2); tt.foo(3);});
        });
    });

    it('should show error for invalid conditions in coffeescript',
      function (done) {
        // TODO: Have this actually implement Breakpoint
        const bp: apiTypes.Breakpoint = {
          id: 'coffee-id-1729',
          location: { path: path.join('.', 'test', 'fixtures', 'coffee',
            'transpile.coffee'), line: 3 },
          condition: 'process=false'
        } as any as apiTypes.Breakpoint;
        api.set(bp, function(err) {
          assert(err);
          assert.equal(err.message, 'Error compiling condition.');
          done();
        });
    });

    it('should be possible to set conditional breakpoints with babel',
      function (done) {
        // TODO: Have this actually implement Breakpoint
        const bp: apiTypes.Breakpoint = {
          id: 'babel-id-1729',
          // TODO: Determine if this path should contain 'build'
          location: { path: path.join('.', 'build', 'test', 'fixtures', 'es6', 'transpile.es6'),
            line: 3 },
          condition: 'i + j === 3'
        } as any as apiTypes.Breakpoint;
        const tt = require('./fixtures/es6/transpile');
        api.set(bp, function(err) {
          assert.ifError(err);
          api.wait(bp, function(err) {
            assert.ifError(err);
            assert.ok(bp.stackFrames);

            const topFrame = bp.stackFrames[0];
            assert.equal(topFrame.locals[0].name, 'j');
            assert.equal(topFrame.locals[0].value, '2');
            assert.equal(topFrame['function'], 'foo');
            api.clear(bp);
            done();
          });
          process.nextTick(function() {tt.foo(1); tt.foo(2);});
        });
    });

    it('should be possible to view watch expressions in coffeescript',
      function(done) {
        // TODO: Have this actually implement Breakpoint
        const bp: apiTypes.Breakpoint = {
            id: 'coffee-id-1729',
            // TODO: Determine if this path should contain 'build'
            location: { path: path.join('.', 'build', 'test', 'fixtures', 'coffee',
              'transpile.coffee'), line: 3 },
            expressions: ['if n == 3 then Math.PI * n else n']
          } as any as apiTypes.Breakpoint;
        const tt = require('./fixtures/coffee/transpile');
        api.set(bp, function(err) {
          assert.ifError(err);
          api.wait(bp, function(err) {
            assert.ifError(err);
            assert.ok(bp.stackFrames);
            assert.ok(bp.variableTable);
            assert.ok(bp.evaluatedExpressions);

            for (const i in bp.evaluatedExpressions) {
              const expr = bp.evaluatedExpressions[i];
              assert(expr.value === String(Math.PI * 3));
            }

            api.clear(bp);
            done();
          });
          process.nextTick(function() {tt.foo(3);});
        });
    });

    it('should capture without values for invalid watch expressions in coffeescript',
      function(done) {
        // TODO: Have this actually implement Breakpoint
        const bp: apiTypes.Breakpoint = {
            id: 'coffee-id-1729',
            // TODO: Determine if this path should contain 'build'
            location: { path: path.join('.', 'build', 'test', 'fixtures',
              'coffee', 'transpile.coffee'),
              line: 3 },
            expressions: [':)', 'n n, n', 'process=this', '((x) -> x x) n', 'return']
          } as any as apiTypes.Breakpoint;
        const tt = require('./fixtures/coffee/transpile');
        api.set(bp, function(err) {
          assert.ifError(err);
          api.wait(bp, function(err) {
            assert.ifError(err);
            assert.ok(bp.stackFrames);
            assert.ok(bp.variableTable);
            assert.ok(bp.evaluatedExpressions);

            for (const i in bp.evaluatedExpressions) {
              const expr = bp.evaluatedExpressions[i];
              assert(expr.status && expr.status.isError);
              if (expr.name === ':)' ||
                  expr.name === 'process=this' ||
                  expr.name === 'return') {
                assert.equal(expr.status.description.format,
                  'Error Compiling Expression');
              } else {
                assert(
                  expr.status.description.format.match('Unexpected token'));
              }
            }

            api.clear(bp);
            done();
          });
          process.nextTick(function() {tt.foo(3);});
        });
      });

    it('should remove listener when breakpoint is cleared before hitting',
      function(done) {
        // TODO: Have this actually implement Breakpoint
        const bp: apiTypes.Breakpoint  = {
          id: breakpointInFoo.id,
          location: breakpointInFoo.location,
          condition: 'n===447'
        } as any as apiTypes.Breakpoint;
        api.set(bp, function(err) {
          assert.ifError(err);
          api.wait(bp, function() {
            assert(false, 'should not reach here');
          });
          process.nextTick(function() {
            code.foo(6);
            process.nextTick(function() {
              api.clear(bp);
              assert(stateIsClean(api));
              done();
            });
          });
        });
      });

    it('should be possible to set multiple breakpoints at once',
      function(done) {
        // TODO: Have this actually implement Breakpoint
        const bp1: apiTypes.Breakpoint = { id: 'bp1', location: { path: __filename, line: 4 }} as any as apiTypes.Breakpoint;
        // TODO: Have this actually implement Breakpoint
        const bp2: apiTypes.Breakpoint = { id: 'bp2', location: { path: __filename, line: 5 }} as any as apiTypes.Breakpoint;
        api.set(bp1, function(err) {
          assert.ifError(err);
          api.set(bp2, function(err) {
            assert.ifError(err);
            assert.equal(api.numBreakpoints_(), 2);
            api.clear(bp1);
            assert.equal(api.numBreakpoints_(), 1);
            api.clear(bp2);
            assert.equal(api.numBreakpoints_(), 0);
            done();
          });
        });
      });


    it('should correctly stop on line-1 breakpoints', function(done) {
      const foo = require('./fixtures/foo.js');
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint = { id: 'bp-line-1', location: {
        path: 'foo.js',
        line: 1,
        column: 45
      }} as any as apiTypes.Breakpoint;
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);
          assert.ok(bp.stackFrames);

          api.clear(bp);
          done();
        });
        process.nextTick(function() {foo();});
      });
    });

    it('should not silence errors thrown in the wait callback', function(done) {
      const message = 'This exception should not be silenced';
      // Remove the mocha listener.
      const listeners = process.listeners('uncaughtException');
      assert.equal(listeners.length, 1);
      const originalListener = listeners[0];
      process.removeListener('uncaughtException', originalListener);
      process.once('uncaughtException', function(err: Error) {
        assert.ok(err);
        assert.equal(err.message, message);
        // Restore the mocha listener.
        process.on('uncaughtException', originalListener);
        done();
      });

      // clone a clean breakpointInFoo
      // TODO: Have this actually implement Breakpoint
      const bp: apiTypes.Breakpoint = {id: breakpointInFoo.id, location: breakpointInFoo.location} as any as apiTypes.Breakpoint;
      api.set(bp, function(err) {
        assert.ifError(err);
        // TODO: Determine if the err parameter should be used.
        api.wait(bp, function(_err) {
          api.clear(bp);
          throw new Error(message);
        });
        process.nextTick(function() {code.foo(1);});
      });
    });

    it('should capture state in transpiled TS async functions', (done) => {
      const bp: apiTypes.Breakpoint = {
        id: 'async-id-1',
        location: {
          path: path.join('.', 'test', 'fixtures', 'ts', 'async.js'),
          line: 71
        }
      } as any as apiTypes.Breakpoint;

      const run = require('./fixtures/ts/async.js');
      api.set(bp, (err) => {
        assert.ifError(err);
        api.wait(bp, (err) => {
          assert.ifError(err);
          assert.ok(bp.stackFrames);

          const topFrame = bp.stackFrames[0];
          assert.ok(topFrame.locals.some((local) => (local.name === '_a')));
          assert.ok(topFrame.locals.some((local) => (local.name === 'res')));
          api.clear(bp);
          done();
        });
      });
      process.nextTick(run);
    });
  });

  it('should be possible to set deferred breakpoints');
});

describe('v8debugapi.findScripts', function() {
  it('should properly handle appPathRelativeToRepository', function() {
    // TODO: `config` was used before it was defined and passed as the third
    //       parameter below.  This was a Typescript compile error.  The
    //       value of `undefined` should be functionally equivalent.
    //       Make sure that is the case.
    const config = extend(true, {}, undefined, {
      workingDirectory: '/some/strange/directory',
      appPathRelativeToRepository: '/my/project/root'
    });

    const fakeFileStats = {
      '/some/strange/directory/test/fixtures/a/hello.js':
          {hash: 'fake', lines: 5},
      '/my/project/root/test/fixtures/a/hello.js': {hash: 'fake', lines: 50}
    };
    const scriptPath = '/my/project/root/test/fixtures/a/hello.js';
    const result = v8debugapi.findScripts(scriptPath, config, fakeFileStats);
    assert.deepEqual(
        result, ['/some/strange/directory/test/fixtures/a/hello.js']);
  });
});

describe('v8debugapi.findScriptsFuzzy', function() {
  const fuzzy = v8debugapi.findScriptsFuzzy;

  it('should not confuse . as a regexp pattern', function() {
    assert.deepEqual(fuzzy('foo.js', ['/fooXjs']), []);
  });

  it('should do suffix matches correctly', function() {

    const TESTS = [
      // Exact match.
      {scriptPath: 'foo.js', fileList: ['/foo.js'], result: ['/foo.js']},
      // Non-exact but unique matches.
      {scriptPath: 'a/foo.js', fileList: ['/foo.js'], result: ['/foo.js']},
      {scriptPath: 'a/foo.js', fileList: ['/b/foo.js'], result: ['/b/foo.js']},
      {
        scriptPath: 'a/foo.js',
        fileList: ['/a/b/foo.js'],
        result: ['/a/b/foo.js']
      },
      // Resolve to a better match.
      {
        scriptPath: 'a/foo.js',
        fileList: ['/b/a/foo.js', '/a/b/foo.js'],
        result: ['/b/a/foo.js']
      },
      // Empty list on no matches.
      {scriptPath: 'st-v8debugapi.js', fileList: ['/doc.js'], result: []},
      // Return multiple exact matches.
      {
        scriptPath: 'a/foo.js',
        fileList: ['x/a/foo.js', 'y/a/foo.js'],
        result: ['x/a/foo.js', 'y/a/foo.js']
      },
      // Fail on multiple fuzzy matches.
      {scriptPath: 'a/foo.js', fileList: ['b/foo.js', 'c/foo.js'], result: []}
    ];

    TESTS.forEach(function(test) {
      const scriptPath = path.normalize(test.scriptPath);
      const fileList = test.fileList.map(path.normalize);
      const result = test.result.map(path.normalize);
      assert.deepEqual(fuzzy(scriptPath, fileList), result);
    });
  });
});
