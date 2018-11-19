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

import {ResolvedDebugAgentConfig} from '../src/agent/config';
import {Debuglet} from '../src/agent/debuglet';
import {DebugApi} from '../src/agent/v8/debugapi';
import consoleLogLevel = require('console-log-level');
import * as stackdriver from '../src/types/stackdriver';
import {MockLogger} from './mock-logger';

// TODO(dominickramer): Have this actually implement Breakpoint
const breakpointInFoo: stackdriver.Breakpoint = {
  id: 'fake-id-123',
  // TODO(dominickramer): Determine if we should be restricting to only the
  // build directory.
  location: {path: 'build/test/test-v8debugapi-code.js', line: 5}
} as stackdriver.Breakpoint;

const MAX_INT = 2147483647;  // Max signed int32.

import * as assert from 'assert';
import * as extend from 'extend';
import * as debugapi from '../src/agent/v8/debugapi';
import {defaultConfig, DebugAgentConfig} from '../src/agent/config';
import {StatusMessage} from '../src/client/stackdriver/status-message';
import * as scanner from '../src/agent/io/scanner';
import {ScanStats} from '../src/agent/io/scanner';
import * as SourceMapper from '../src/agent/io/sourcemapper';
import * as path from 'path';
import * as utils from '../src/agent/util/utils';
import {debugAssert} from '../src/agent/util/debug-assert';
const code = require('./test-v8debugapi-code.js');
import {dist} from './test-v8debugapi-ts-code';

function stateIsClean(api: DebugApi): boolean {
  assert.strictEqual(
      api.numBreakpoints_(), 0, 'there should be no breakpoints active');
  assert.strictEqual(
      api.numListeners_(), 0, 'there should be no listeners active');
  return true;
}

function validateVariable(variable: stackdriver.Variable|null): void {
  assert.ok(variable);
  if (variable) {
    if (variable.name) {
      assert.strictEqual(typeof variable.name, 'string');
    }
    if (variable.value) {
      assert.strictEqual(typeof variable.value, 'string');
    }
    if (variable.type) {
      assert.strictEqual(typeof variable.type, 'string');
    }
    if (variable.members) {
      variable.members.forEach(validateVariable);
    }
    if (variable.varTableIndex) {
      assert.ok(
          Number.isInteger(variable.varTableIndex) &&
          variable.varTableIndex >= 0 && variable.varTableIndex <= MAX_INT);
    }
  }
}

function validateSourceLocation(location: stackdriver.SourceLocation): void {
  if (location.path) {
    assert.strictEqual(typeof location.path, 'string');
  }
  if (location.line) {
    assert.ok(
        Number.isInteger(location.line) && location.line >= 1 &&
        location.line <= MAX_INT);
  }
}

function validateStackFrame(frame: stackdriver.StackFrame): void {
  if (frame['function']) {
    assert.strictEqual(typeof frame['function'], 'string');
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

function validateBreakpoint(breakpoint: stackdriver.Breakpoint): void {
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

describe(
    'propertly determines if the inspector protocol should be used', () => {
      let suffixes = ['', '.11', '.11.1'];
      // also handle suffixes associated with nightly builds
      suffixes = suffixes.concat(
          suffixes.map(suffix => suffix + '-nightly201804132a6ab9b37b'));

      it('handles Node >=10 correctly', () => {
        // on Node >= 10, inspector should always be used
        for (let version = 10; version <= 11; version++) {
          for (const suffix of suffixes) {
            const fullVersion = `v${version}${suffix}`;
            assert.strictEqual(
                debugapi.willUseInspector(fullVersion), true,
                `Should use inspector in Node.js version ${fullVersion}`);
          }
        }
      });

      it('handles Node <10 correctly', () => {
        // on Node < 10, inspector should never be used
        for (let version = 4; version <= 9; version++) {
          for (const suffix of suffixes) {
            const fullVersion = `v${version}${suffix}`;
            assert.strictEqual(
                debugapi.willUseInspector(fullVersion), false,
                `Should not use inspector in Node.js version ${fullVersion}`);
          }
        }
      });
    });

describe('debugapi selection', () => {
  const config: ResolvedDebugAgentConfig = extend(
      {}, defaultConfig, {workingDirectory: __dirname, forceNewAgent_: true});
  const logger =
      consoleLogLevel({level: Debuglet.logLevelToName(config.logLevel)});
  let logText = '';
  logger.warn = (s: string) => {
    logText += s;
  };
  it('should use the correct debugapi and have appropriate warning', (done) => {
    let api: DebugApi;
    scanner.scan(true, config.workingDirectory, /.js$|.js.map$/)
        .then(async (fileStats) => {
          assert.strictEqual(fileStats.errors().size, 0);
          const jsStats = fileStats.selectStats(/.js$/);
          const mapFiles = fileStats.selectFiles(/.js.map$/, process.cwd());
          const mapper = await SourceMapper.create(mapFiles);
          // TODO(dominickramer): Handle the case when mapper is undefined.
          // TODO(dominickramer): Handle the case when v8debugapi.create
          // returns null
          api = debugapi.create(
                    logger, config, jsStats,
                    mapper as SourceMapper.SourceMapper) as DebugApi;
          if (debugapi.willUseInspector()) {
            const inspectorapi = require('../src/agent/v8/inspector-debugapi');
            assert.ok(api instanceof inspectorapi.InspectorDebugApi);
          } else {
            const v8debugapi = require('../src/agent/v8/legacy-debugapi');
            assert.ok(api instanceof v8debugapi.V8DebugApi);
          }
          done();
        });
  });
});

const describeFn =
    utils.satisfies(process.version, '>=10') ? describe : describe.skip;
describeFn('debugapi selection on Node >=10', () => {
  const config: ResolvedDebugAgentConfig = extend(
      {}, defaultConfig, {workingDirectory: __dirname, forceNewAgent_: true});
  const logger =
      consoleLogLevel({level: Debuglet.logLevelToName(config.logLevel)});

  let logText = '';
  logger.warn = (s: string) => {
    logText += s;
  };

  it('should always use the inspector api', (done) => {
    let api: DebugApi;
    scanner.scan(true, config.workingDirectory, /.js$|.js.map$/)
        .then(async (fileStats) => {
          assert.strictEqual(fileStats.errors().size, 0);
          const jsStats = fileStats.selectStats(/.js$/);
          const mapFiles = fileStats.selectFiles(/.js.map$/, process.cwd());
          const mapper = await SourceMapper.create(mapFiles);
          assert(mapper);
          api = debugapi.create(logger, config, jsStats, mapper!);
          const inspectorapi = require('../src/agent/v8/inspector-debugapi');
          assert.ok(api instanceof inspectorapi.InspectorDebugApi);
          done();
        });
  });
});

describe('v8debugapi', () => {
  const config: ResolvedDebugAgentConfig = extend(
      {}, defaultConfig, {workingDirectory: __dirname, forceNewAgent_: true});
  const logger =
      consoleLogLevel({level: Debuglet.logLevelToName(config.logLevel)});
  let api: DebugApi;

  beforeEach((done) => {
    if (!api) {
      scanner.scan(true, config.workingDirectory, /.js$|.js.map$/)
          .then(async (fileStats) => {
            assert.strictEqual(fileStats.errors().size, 0);
            const jsStats = fileStats.selectStats(/.js$/);
            const mapFiles = fileStats.selectFiles(/.js.map$/, process.cwd());
            const mapper = await SourceMapper.create(mapFiles);

            // TODO(dominickramer): Handle the case when mapper is undefined.
            // TODO(dominickramer): Handle the case when v8debugapi.create
            // returns null
            api = debugapi.create(
                      logger, config, jsStats,
                      mapper as SourceMapper.SourceMapper) as DebugApi;
            assert.ok(api, 'should be able to create the api');

            // monkey-patch wait to add validation of the breakpoints.
            const origWait = api.wait.bind(api);
            api.wait = (bp, callback) => {
              origWait(bp, (err2?: Error) => {
                validateBreakpoint(bp);
                callback(err2);
              });
            };
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

  it('should be able to set and remove breakpoints', (done) => {
    // clone a clean breakpointInFoo
    // TODO(dominickramer): Have this actually implement Breakpoint
    const bp: stackdriver.Breakpoint = {
      id: breakpointInFoo.id,
      location: breakpointInFoo.location
    } as stackdriver.Breakpoint;
    api.set(bp, (err1) => {
      assert.ifError(err1);
      assert.strictEqual(api.numBreakpoints_(), 1);
      api.clear(bp, (err2) => {
        assert.ifError(err2);
        done();
      });
    });
  });

  it('should accept breakpoint with ids 0 as a valid breakpoint', (done) => {
    // TODO(dominickramer): Have this actually implement Breakpoint
    const bp:
        stackdriver.Breakpoint = {id: 0, location: breakpointInFoo.location} as
        {} as stackdriver.Breakpoint;
    api.set(bp, (err1) => {
      assert.ifError(err1);
      api.clear(bp, (err2) => {
        assert.ifError(err2);
        done();
      });
    });
  });

  it('should set error for breakpoint in non-js files', (done) => {
    require('./fixtures/key-bad.json');
    // TODO(dominickramer): Have this actually implement Breakpoint
    const bp = {
      id: 0,
      location: {line: 1, path: path.join('fixtures', 'key-bad.json')}
    } as {} as stackdriver.Breakpoint;
    api.set(bp, (err) => {
      assert.ok(err, 'should return an error');
      assert.ok(bp.status);
      assert.ok(bp.status instanceof StatusMessage);
      assert.strictEqual(bp.status!.refersTo, 'BREAKPOINT_SOURCE_LOCATION');
      assert.ok(bp.status!.isError);
      done();
    });
  });

  it('should disambiguate incorrect path if filename is unique', (done) => {
    require('./fixtures/foo.js');
    // TODO(dominickramer): Have this actually implement Breakpoint
    const bp: stackdriver.Breakpoint = {
      id: 0,
      location: {line: 1, path: path.join(path.sep, 'test', 'foo.js')}
    } as {} as stackdriver.Breakpoint;
    api.set(bp, (err1) => {
      assert.ifError(err1);
      api.clear(bp, (err2) => {
        assert.ifError(err2);
        done();
      });
    });
  });

  it('should disambiguate incorrect path if partial path is unique', (done) => {
    require('./fixtures/foo.js');
    // hello.js is not unique but a/hello.js is.
    // TODO(dominickramer): Have this actually implement Breakpoint
    const bp: stackdriver.Breakpoint = {
      id: 0,
      location:
          {line: 1, path: path.join(path.sep, 'Server', 'a', 'hello.js')}
    } as {} as stackdriver.Breakpoint;
    api.set(bp, (err1) => {
      assert.ifError(err1);
      api.clear(bp, (err2) => {
        assert.ifError(err2);
        done();
      });
    });
  });

  describe('invalid breakpoints', () => {
    // TODO(dominickramer): Have this actually be a list of Breakpoints
    const badBreakpoints: stackdriver.Breakpoint[] = [
      {} as {} as stackdriver.Breakpoint,
      {id: 'with no location'} as {} as stackdriver.Breakpoint,
      {id: 'with bad location', location: {}} as {} as stackdriver.Breakpoint,
      {id: 'with no path', location: {line: 4}} as {} as stackdriver.Breakpoint,
      {id: 'with no line', location: {path: 'foo.js'}} as {} as
          stackdriver.Breakpoint,
      {
        id: 'with incomplete path',
        location: {path: 'st-v8debugapi.js', line: 4}
      } as {} as stackdriver.Breakpoint
    ];

    badBreakpoints.forEach((bp: stackdriver.Breakpoint) => {
      it('should reject breakpoint ' + bp.id, (done) => {
        api.set(bp, (err) => {
          assert.ok(err, 'should return an error');
          assert.ok(bp.status);
          assert.ok(bp.status instanceof StatusMessage);
          assert.ok(bp.status!.isError);
          done();
        });
      });
    });

    it('should reject breakpoint when filename is ambiguous', (done) => {
      require('./fixtures/a/hello.js');
      require('./fixtures/b/hello.js');
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp: stackdriver.Breakpoint = {
        id: 'ambiguous',
        location: {line: 1, path: 'hello.js'}
      } as {} as stackdriver.Breakpoint;
      api.set(bp, (err) => {
        assert.ok(err);
        assert.ok(bp.status);
        assert.ok(bp.status instanceof StatusMessage);
        assert.ok(bp.status!.isError);
        assert(
            bp.status!.description.format ===
            utils.messages.SOURCE_FILE_AMBIGUOUS);
        done();
      });
    });

    it('should reject breakpoint on non-existent line', (done) => {
      require('./fixtures/foo.js');
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp: stackdriver.Breakpoint = {
        id: 'non-existent line',
        location: {path: path.join('fixtures', 'foo.js'), line: 500}
      } as {} as stackdriver.Breakpoint;
      api.set(bp, (err) => {
        assert.ok(err);
        assert.ok(bp.status);
        assert.ok(bp.status instanceof StatusMessage);
        assert.ok(bp.status!.isError);
        assert(bp.status!.description.format.match(
            `${utils.messages.INVALID_LINE_NUMBER}.*foo.js:500`));
        done();
      });
    });
  });

  function conditionTests(
      subject: string, test: (err: Error|null) => void,
      expressions: Array<string|null>) {
    describe(subject, () => {
      expressions.forEach((expr) => {
        it('should validate breakpoint with condition "' + expr + '"',
           (done) => {
             // make a clean copy of breakpointInFoo
             // TODO(dominickramer): Have this actually implement Breakpoint
             const bp: stackdriver.Breakpoint = {
               id: breakpointInFoo.id,
               location: breakpointInFoo.location,
               condition: expr
             } as {} as stackdriver.Breakpoint;
             api.set(bp, (err1) => {
               test(err1);
               api.clear(bp, (err2) => {
                 test(err2);
                 done();
               });
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
  conditionTests(
      'valid conditions',
      (err) => {
        assert.ifError(err);
      },
      [
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

  if (utils.satisfies(process.version, '>=4.0')) {
    conditionTests('invalid conditions Node 4+', assert, [
      '[][Symbol.iterator]()', '`${[][Symbol.iterator]()}`', '`${let x = 1}`',
      '`${JSON.parse("{x:1}")}`', '`${try {1}}`'
    ]);
    conditionTests(
        'valid conditions Node 4+',
        (err) => {
          assert.ifError(err);
        },
        [
          '[][Symbol.iterator]', '[..."peanut butter"]', '[0,...[1,2,"foo"]]',
          '`${1}`', '`${[][1+1]}`', '0b10101010', '0o70000',
          // Disabled because of suspect acorn issues?
          // https://tonicdev.com/575b00351a0e0a1300505d00/575b00351a0e0a1300505d01
          // '{["foo"]: 1}',
          // '{ foo (a,b) {}}'
        ]);
  }

  describe('path normalization', () => {
    // TODO(dominickramer): Have this actually be a list of Breakpoints
    const breakpoints = [
      {
        id: 'path0',
        location: {
          line: 5,
          path: path.join(path.sep, 'test', 'test-v8debugapi-code.js')
        }
      } as {} as stackdriver.Breakpoint,
      {
        id: 'path1',
        location:
            {line: 5, path: path.join('test', 'test-v8debugapi-code.js')}
      } as {} as stackdriver.Breakpoint,
      {
        id: 'path2',
        location: {
          line: 5,
          path:
              // Usage the absolute path to `test-v8debugapi-code.js`.
              __filename.split(path.sep)
                  .slice(0, -1)
                  .concat('test-v8debugapi-code.js')
                  .join(path.sep)
        }
      } as {} as stackdriver.Breakpoint,
      {
        id: 'with . in path',
        location: {
          path: path.join('test', '.', 'test-v8debugapi-code.js'),
          line: 5
        }
      } as {} as stackdriver.Breakpoint,
      {
        id: 'with . in path',
        location: {path: path.join('.', 'test-v8debugapi-code.js'), line: 5}
      } as {} as stackdriver.Breakpoint,
      {
        id: 'with .. in path',
        location: {
          path: path.join('test', '..', 'test-v8debugapi-code.js'),
          line: 5
        }
      } as {} as stackdriver.Breakpoint,
      {
        id: 'with .. in path',
        location: {
          path: path.join('..', 'test', 'test-v8debugapi-code.js'),
          line: 5
        }
      } as {} as stackdriver.Breakpoint
    ];

    breakpoints.forEach((bp: stackdriver.Breakpoint) => {
      it('should handle breakpoint as ' + bp.location!.path, (done) => {
        api.set(bp, (err1) => {
          assert.ifError(err1);
          api.wait(bp, (err2) => {
            assert.ifError(err2);
            api.clear(bp, (err3) => {
              assert.ifError(err3);
              done();
            });
          });
          process.nextTick(() => {
            code.foo(7);
          });
        });
      });
    });
  });

  describe('log', () => {
    let oldLPS: number;
    let oldDS: number;

    before(() => {
      oldLPS = config.log.maxLogsPerSecond;
      oldDS = config.log.logDelaySeconds;
      config.log.maxLogsPerSecond = 1;
      config.log.logDelaySeconds = 1;
    });

    after(() => {
      config.log.maxLogsPerSecond = oldLPS;
      config.log.logDelaySeconds = oldDS;
      assert(stateIsClean(api));
    });

    it('should throttle correctly', (done) => {
      let completed = false;
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp: stackdriver.Breakpoint = {
        id: breakpointInFoo.id,
        location: breakpointInFoo.location,
        action: 'LOG',
        logMessageFormat: 'cat'
      } as {} as stackdriver.Breakpoint;
      api.set(bp, (err1) => {
        let transcript = '';
        let runCount = 0;
        assert.ifError(err1);
        api.log(
            bp,
            (fmt) => {
              transcript += fmt;
            },
            () => {
              return completed;
            });
        const interval = setInterval(() => {
          code.foo(1);
          runCount++;
        }, 100);
        setTimeout(() => {
          completed = true;
          assert.strictEqual(transcript, 'catcat');
          assert(runCount > 12);
          clearInterval(interval);
          api.clear(bp, (err2) => {
            assert.ifError(err2);
            done();
          });
        }, 1500);
      });
    });
  });

  describe('set and wait', () => {
    it('should be possible to wait on a breakpoint', (done) => {
      // clone a clean breakpointInFoo
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp: stackdriver.Breakpoint = {
        id: breakpointInFoo.id,
        location: breakpointInFoo.location
      } as {} as stackdriver.Breakpoint;
      api.set(bp, (err1) => {
        assert.ifError(err1);
        api.wait(bp, (err2) => {
          assert.ifError(err2);
          api.clear(bp, (err3) => {
            assert.ifError(err3);
            done();
          });
        });
        process.nextTick(() => {
          code.foo(1);
        });
      });
    });

    it('should resolve actual line number hit rather than originally set for js files',
       (done) => {
         const bp: stackdriver.Breakpoint = {
           id: 'fake-id-124',
           location: {path: 'build/test/test-v8debugapi-code.js', line: 4}
         } as {} as stackdriver.Breakpoint;
         api.set(bp, (err1) => {
           assert.ifError(err1);
           api.wait(bp, (err2) => {
             assert.ifError(err2);
             assert.strictEqual(
                 (bp.location as stackdriver.SourceLocation).line, 5);
             api.clear(bp, (err3) => {
               assert.ifError(err3);
               done();
             });
           });
           process.nextTick(() => {
             code.foo(1);
           });
         });
       });

    it('should not change line number when breakpoints hit for transpiled files',
       (done) => {
         const bp: stackdriver.Breakpoint = {
           id: 'fake-id-125',
           location: {
             path: path.join('test', 'test-v8debugapi-ts-code.ts'),
             line: 10
           }
         } as stackdriver.Breakpoint;
         api.set(bp, (err1) => {
           assert.ifError(err1);
           api.wait(bp, (err2) => {
             assert.ifError(err2);
             assert(bp.location);
             assert.strictEqual(bp.location!.line, 10);
             api.clear(bp, (err3) => {
               assert.ifError(err3);
               done();
             });
           });
           process.nextTick(() => {
             dist({x: 1, y: 2}, {x: 3, y: 4});
           });
         });
       });

    it('should hit breakpoints in shorter transpiled files', (done) => {
      const someFunction = require('./fixtures/transpiled-shorter/in.js');
      const bp: stackdriver.Breakpoint = {
        id: 'fake-id-shorter-transpiled',
        location: {
          path: path.join(
              'build', 'test', 'fixtures', 'transpiled-shorter', 'in.coffee'),
          // Note: The file `./fixtures/transpiled-shorter/in.js` was generated
          // from
          //       transpiling `./fixtures/transpiled-shorter/in.coffee`, and
          //       `in.js` only has 44 lines.  The purpose of this test is to
          //       ensure that if the line number specified below is larger than
          //       the number of lines in `in.js` but less than or equal to the
          //       number of lines in `in.coffee`, the breakpoint will still hit
          //       correctly.
          line: 60
        }
      } as stackdriver.Breakpoint;
      api.set(bp, (err1) => {
        assert.ifError(err1);
        api.wait(bp, (err2) => {
          assert.ifError(err2);
          assert(bp.location);
          assert.strictEqual(bp.location!.line, 60);
          api.clear(bp, (err3) => {
            assert.ifError(err3);
            done();
          });
        });
        process.nextTick(someFunction);
      });
    });

    it('should work with multiply hit breakpoints', (done) => {
      const oldWarn = logger.warn;
      let logCount = 0;
      // If an exception is thrown we will log
      logger.warn = () => {
        logCount++;
      };
      // clone a clean breakpointInFoo
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp: stackdriver.Breakpoint = {
        id: breakpointInFoo.id,
        location: breakpointInFoo.location
      } as {} as stackdriver.Breakpoint;
      api.set(bp, (err1) => {
        assert.ifError(err1);
        api.wait(bp, (err2) => {
          assert.ifError(err2);
          setTimeout(() => {
            logger.warn = oldWarn;
            assert.strictEqual(logCount, 0);
            api.clear(bp, (err3) => {
              assert.ifError(err3);
              done();
            });
          }, 100);
        });
        process.nextTick(() => {
          code.foo(1);
        });
        setTimeout(() => {
          code.foo(2);
        }, 50);
      });
    });

    it('should be possible to wait on a logpoint without expressions',
       (done) => {
         // TODO(dominickramer): Have this actually implement Breakpoint
         const bp: stackdriver.Breakpoint = {
           id: breakpointInFoo.id,
           action: 'LOG',
           logMessageFormat: 'Hello World',
           location: breakpointInFoo.location
         } as {} as stackdriver.Breakpoint;
         api.set(bp, (err1) => {
           assert.ifError(err1);
           api.wait(bp, (err2) => {
             assert.ifError(err2);
             api.clear(bp, (err3) => {
               assert.ifError(err3);
               done();
             });
           });
           process.nextTick(() => {
             code.foo(1);
           });
         });
       });

    it('should capture state', (done) => {
      // clone a clean breakpointInFoo
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp: stackdriver.Breakpoint = {
        id: breakpointInFoo.id,
        location: breakpointInFoo.location
      } as {} as stackdriver.Breakpoint;
      api.set(bp, (err1) => {
        assert.ifError(err1);
        api.wait(bp, (err2) => {
          assert.ifError(err2);
          assert.ok(bp.stackFrames);
          assert.ok(bp.variableTable);

          const topFrame = bp.stackFrames[0];
          assert.ok(topFrame);
          assert.strictEqual(topFrame['function'], 'foo');
          assert.strictEqual(topFrame.locals[0].name, 'n');
          assert.strictEqual(topFrame.locals[0].value, '2');
          assert.strictEqual(topFrame.locals[1].name, 'A');
          assert.strictEqual(topFrame.locals[2].name, 'B');
          api.clear(bp, (err3) => {
            assert.ifError(err3);
            done();
          });
        });
        process.nextTick(() => {
          code.foo(2);
        });
      });
    });

    it('should resolve correct frame count', (done) => {
      // clone a clean breakpointInFoo
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp: stackdriver.Breakpoint = {
        id: breakpointInFoo.id,
        location: breakpointInFoo.location
      } as {} as stackdriver.Breakpoint;
      const oldCount = config.capture.maxExpandFrames;
      config.capture.maxExpandFrames = 0;
      api.set(bp, (err1) => {
        assert.ifError(err1);
        api.wait(bp, (err2) => {
          assert.ifError(err2);
          assert.ok(bp.stackFrames);
          assert.ok(bp.variableTable);
          const topFrame = bp.stackFrames[0];
          assert.ok(topFrame);
          assert.strictEqual(topFrame['function'], 'foo');
          assert.strictEqual(topFrame.arguments.length, 1);
          // TODO(dominickramer): Handle the case when
          // topFrame.arguments[0].varTableIndex
          //       is undefined.
          const argsVal =
              bp.variableTable[topFrame.arguments[0].varTableIndex as number];
          assert(argsVal!.status!.isError);
          assert(argsVal!.status!.description.format.match(
              'Locals and arguments are only displayed.*config.capture.maxExpandFrames=0'));
          assert.strictEqual(topFrame.locals.length, 1);
          // TODO(dominickramer): Handle the case when
          // topFrame.locals[0].varTableIndex is
          //       undefined.
          const localsVal =
              bp.variableTable[topFrame.locals[0].varTableIndex as number];
          assert(localsVal!.status!.isError);
          assert(localsVal!.status!.description.format.match(
              'Locals and arguments are only displayed.*config.capture.maxExpandFrames=0'));
          api.clear(bp, (err3) => {
            config.capture.maxExpandFrames = oldCount;
            assert.ifError(err3);
            done();
          });
        });
        process.nextTick(() => {
          code.foo(2);
        });
      });
    });

    it('should capture correct frame count', (done) => {
      // clone a clean breakpointInFoo
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp: stackdriver.Breakpoint = {
        id: breakpointInFoo.id,
        location: breakpointInFoo.location
      } as {} as stackdriver.Breakpoint;
      const oldMax = config.capture.maxFrames;
      config.capture.maxFrames = 1;
      api.set(bp, (err1) => {
        assert.ifError(err1);
        api.wait(bp, (err2) => {
          assert.ifError(err2);
          assert.ok(bp.stackFrames);
          assert.strictEqual(bp.stackFrames.length, config.capture.maxFrames);
          const topFrame = bp.stackFrames[0];
          assert.ok(topFrame);
          assert.strictEqual(topFrame['function'], 'foo');
          assert.strictEqual(topFrame.locals[0].name, 'n');
          assert.strictEqual(topFrame.locals[0].value, '2');
          api.clear(bp, (err3) => {
            config.capture.maxFrames = oldMax;
            assert.ifError(err3);
            done();
          });
        });
        process.nextTick(() => {
          code.foo(2);
        });
      });
    });

    it('should capture state with watch expressions', (done) => {
      // clone a clean breakpointInFoo
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp: stackdriver.Breakpoint = {
        id: breakpointInFoo.id,
        location: breakpointInFoo.location,
        expressions: ['process']
      } as {} as stackdriver.Breakpoint;
      const oldMaxProps = config.capture.maxProperties;
      const oldMaxData = config.capture.maxDataSize;
      config.capture.maxProperties = 0;
      config.capture.maxDataSize = 20000;
      api.set(bp, (err1) => {
        assert.ifError(err1);
        api.wait(bp, (err2) => {
          assert.ifError(err2);
          assert.ok(bp.stackFrames);
          assert.ok(bp.variableTable);
          assert.ok(bp.evaluatedExpressions);

          const topFrame = bp.stackFrames[0];
          assert.strictEqual(topFrame['function'], 'foo');
          assert.strictEqual(topFrame.locals[0].name, 'n');
          assert.strictEqual(topFrame.locals[0].value, '3');

          const watch = bp.evaluatedExpressions[0];
          assert.strictEqual(watch!.name, 'process');
          assert.ok(watch!.varTableIndex);

          // Make sure the process object looks sensible.
          const processVal = bp.variableTable[watch!.varTableIndex as number];
          assert.ok(processVal);
          assert.ok(processVal!.members!.some((m: stackdriver.Variable) => {
            return m.name === 'nextTick' && !!m.value!.match('function.*');
          }));
          assert.ok(processVal!.members!.some((m: stackdriver.Variable) => {
            return m.name === 'versions' && !!m.varTableIndex;
          }));

          api.clear(bp, (err3) => {
            config.capture.maxDataSize = oldMaxData;
            config.capture.maxProperties = oldMaxProps;
            assert.ifError(err3);
            done();
          });
        });
        process.nextTick(() => {
          code.foo(3);
        });
      });
    });

    it('should report error for native prop or getter', (done) => {
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp: stackdriver.Breakpoint = {
        id: 'fake-id-124',
        // TODO(dominickramer): This path can be lest strict when this file has
        // been
        //       converted to Typescript.
        location: {path: 'build/test/test-v8debugapi-code.js', line: 10},
        expressions: ['process.env', 'hasGetter']
      } as {} as stackdriver.Breakpoint;
      const oldMaxData = config.capture.maxDataSize;
      config.capture.maxDataSize = 20000;
      api.set(bp, (err1) => {
        assert.ifError(err1);
        api.wait(bp, (err2) => {
          assert.ifError(err2);

          const procEnv = bp.evaluatedExpressions[0];
          assert.strictEqual(procEnv!.name, 'process.env');
          const envVal = bp.variableTable[procEnv!.varTableIndex!];
          envVal!.members!.forEach((member: stackdriver.Variable) => {
            if (member.hasOwnProperty('varTableIndex')) {
              assert(bp.variableTable[member.varTableIndex!]!.status!.isError);
            }
          });
          const hasGetter = bp.evaluatedExpressions[1];
          const getterVal = bp.variableTable[hasGetter!.varTableIndex!];
          assert(getterVal!.members!.some(m => {
            return m.value === '5';
          }));
          assert(getterVal!.members!.some(m => {
            const resolved = bp.variableTable[m.varTableIndex!];
            return !!resolved && !!resolved.status!.isError;
          }));

          api.clear(bp, (err3) => {
            config.capture.maxDataSize = oldMaxData;
            assert.ifError(err3);
            done();
          });
        });
        process.nextTick(() => {
          code.getterObject();
        });
      });
    });

    it('should work with array length despite being native', (done) => {
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp: stackdriver.Breakpoint = {
        id: breakpointInFoo.id,
        // TODO(dominickramer): This path can be lest strict when this file has
        // been
        //       converted to Typescript.
        location: {path: 'build/test/test-v8debugapi-code.js', line: 6},
        expressions: ['A']
      } as {} as stackdriver.Breakpoint;
      api.set(bp, (err1) => {
        assert.ifError(err1);
        api.wait(bp, (err2) => {
          assert.ifError(err2);

          const arrEnv = bp.evaluatedExpressions[0];
          assert.strictEqual(arrEnv!.name, 'A');
          const envVal = bp.variableTable[arrEnv!.varTableIndex!];
          let found = false;
          envVal!.members!.forEach(member => {
            if (member.name === 'length') {
              assert(!member.varTableIndex);
              assert.strictEqual(Number(member.value), 3);
              found = true;
            }
          });
          assert(found);

          api.clear(bp, (err3) => {
            assert.ifError(err3);
            done();
          });
        });
        process.nextTick(() => {
          code.foo();
        });
      });
    });

    it('should limit string length', (done) => {
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp: stackdriver.Breakpoint = {
        id: 'fake-id-124',
        // TODO(dominickramer): This path can be lest strict when this file has
        // been
        //       converted to Typescript.
        location: {path: 'build/test/test-v8debugapi-code.js', line: 10}
      } as {} as stackdriver.Breakpoint;
      const oldMaxLength = config.capture.maxStringLength;
      const oldMaxData = config.capture.maxDataSize;
      config.capture.maxStringLength = 3;
      config.capture.maxDataSize = 20000;
      api.set(bp, (err1) => {
        assert.ifError(err1);
        api.wait(bp, (err2) => {
          assert.ifError(err2);
          const hasGetter = bp.stackFrames[0].locals.filter((value) => {
            return value.name === 'hasGetter';
          });
          const getterVal = bp.variableTable[hasGetter[0].varTableIndex!];
          const stringItems = getterVal!.members!.filter(m => {
            return m.value === 'hel...';
          });
          assert(stringItems.length === 1);

          const item = stringItems[0];
          assert(item.status!.description.format.match(
              'Only first.*config.capture.maxStringLength=3.*of length 11.'));
          api.clear(bp, (err3) => {
            config.capture.maxDataSize = oldMaxData;
            config.capture.maxStringLength = oldMaxLength;
            assert.ifError(err3);
            done();
          });
        });
        process.nextTick(() => {
          code.getterObject();
        });
      });
    });

    it('should limit array length', (done) => {
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp: stackdriver.Breakpoint = {
        id: 'fake-id-124',
        // TODO(dominickramer): This path can be lest strict when this file has
        // been
        //       converted to Typescript.
        location: {path: 'build/test/test-v8debugapi-code.js', line: 6}
      } as {} as stackdriver.Breakpoint;
      const oldMax = config.capture.maxProperties;
      config.capture.maxProperties = 1;
      api.set(bp, (err1) => {
        assert.ifError(err1);
        api.wait(bp, (err2) => {
          assert.ifError(err2);
          const aResults = bp.stackFrames[0].locals.filter((value) => {
            return value.name === 'A';
          });
          const aVal = bp.variableTable[aResults[0].varTableIndex!];
          // should have 1 element + truncation message.
          assert.strictEqual(aVal!.members!.length, 2);
          assert(aVal!.members![1].name!.match(
              'Only first.*config.capture.maxProperties=1'));

          api.clear(bp, (err3) => {
            config.capture.maxProperties = oldMax;
            assert.ifError(err3);
            done();
          });
        });
        process.nextTick(() => {
          code.foo(2);
        });
      });
    });

    it('should limit object length', (done) => {
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp: stackdriver.Breakpoint = {
        id: 'fake-id-124',
        // TODO(dominickramer): This path can be lest strict when this file has
        // been
        //       converted to Typescript.
        location: {path: 'build/test/test-v8debugapi-code.js', line: 6}
      } as {} as stackdriver.Breakpoint;
      const oldMax = config.capture.maxProperties;
      config.capture.maxProperties = 1;
      api.set(bp, (err1) => {
        assert.ifError(err1);
        api.wait(bp, (err2) => {
          assert.ifError(err2);
          const bResults = bp.stackFrames[0].locals.filter((value) => {
            return value.name === 'B';
          });
          const bVal = bp.variableTable[bResults[0].varTableIndex!];
          // should have 1 element + truncation message
          assert.strictEqual(bVal!.members!.length, 2);
          assert(bVal!.members![1].name!.match(
              'Only first.*config.capture.maxProperties=1'));

          api.clear(bp, (err3) => {
            config.capture.maxProperties = oldMax;
            assert.ifError(err3);
            done();
          });
        });
        process.nextTick(() => {
          code.foo(2);
        });
      });
    });

    it('should not limit the length of an evaluated string based on maxStringLength',
       (done) => {
         // TODO(dominickramer): Have this actually implement Breakpoint
         const bp: stackdriver.Breakpoint = {
           id: 'fake-id-124',
           // TODO(dominickramer): This path can be lest strict when this file
           // has been
           //       converted to Typescript.
           location: {path: 'build/test/test-v8debugapi-code.js', line: 10},
           expressions: ['hasGetter']
         } as {} as stackdriver.Breakpoint;
         const oldMaxLength = config.capture.maxStringLength;
         const oldMaxData = config.capture.maxDataSize;
         config.capture.maxStringLength = 3;
         config.capture.maxDataSize = 20000;
         api.set(bp, (err1) => {
           assert.ifError(err1);
           api.wait(bp, (err2) => {
             assert.ifError(err2);
             const hasGetter = bp.evaluatedExpressions[0];
             const getterVal = bp.variableTable[hasGetter!.varTableIndex!];
             const stringItems = getterVal!.members!.filter(m => {
               return m.value === 'hello world';
             });
             // The property would have value 'hel...' if truncation occured
             // resulting in stringItems.length being 0.
             assert(stringItems.length === 1);

             api.clear(bp, (err3) => {
               config.capture.maxDataSize = oldMaxData;
               config.capture.maxStringLength = oldMaxLength;
               assert.ifError(err3);
               done();
             });
           });
           process.nextTick(() => {
             code.getterObject();
           });
         });
       });

    it('should not limit the length of an evaluated array based on maxProperties',
       (done) => {
         // TODO(dominickramer): Have this actually implement Breakpoint
         const bp: stackdriver.Breakpoint = {
           id: 'fake-id-124',
           // TODO(dominickramer): This path can be lest strict when this file
           // has been
           //       converted to Typescript.
           location: {path: 'build/test/test-v8debugapi-code.js', line: 6},
           expressions: ['A']
         } as {} as stackdriver.Breakpoint;
         const oldMaxProps = config.capture.maxProperties;
         const oldMaxData = config.capture.maxDataSize;
         config.capture.maxProperties = 1;
         config.capture.maxDataSize = 20000;
         api.set(bp, (err1) => {
           assert.ifError(err1);
           api.wait(bp, (err2) => {
             assert.ifError(err2);
             const foo = bp.evaluatedExpressions[0];
             const fooVal = bp.variableTable[foo!.varTableIndex!];
             // '1', '2', '3', and 'length'
             assert.strictEqual(fooVal!.members!.length, 4);
             assert.strictEqual(foo!.status, undefined);

             api.clear(bp, (err3) => {
               config.capture.maxDataSize = oldMaxData;
               config.capture.maxProperties = oldMaxProps;
               assert.ifError(err3);
               done();
             });
           });
           process.nextTick(() => {
             code.foo(2);
           });
         });
       });

    it('should not limit the length of an evaluated object based on maxProperties',
       (done) => {
         // TODO(dominickramer): Have this actually implement Breakpoint
         const bp: stackdriver.Breakpoint = {
           id: 'fake-id-124',
           // TODO(dominickramer): This path can be lest strict when this file
           // has been
           //       converted to Typescript.
           location: {path: 'build/test/test-v8debugapi-code.js', line: 6},
           expressions: ['B']
         } as {} as stackdriver.Breakpoint;
         const oldMaxProps = config.capture.maxProperties;
         const oldMaxData = config.capture.maxDataSize;
         config.capture.maxProperties = 1;
         config.capture.maxDataSize = 20000;
         api.set(bp, (err1) => {
           assert.ifError(err1);
           api.wait(bp, (err2) => {
             assert.ifError(err2);
             const foo = bp.evaluatedExpressions[0];
             const fooVal = bp.variableTable[foo!.varTableIndex!];
             assert.strictEqual(fooVal!.members!.length, 3);
             assert.strictEqual(foo!.status, undefined);

             api.clear(bp, (err3) => {
               config.capture.maxDataSize = oldMaxData;
               config.capture.maxProperties = oldMaxProps;
               assert.ifError(err3);
               done();
             });
           });
           process.nextTick(() => {
             code.foo(2);
           });
         });
       });

    it('should display an error for an evaluated array beyond maxDataSize',
       (done) => {
         // TODO(dominickramer): Have this actually implement Breakpoint
         const bp: stackdriver.Breakpoint = {
           id: 'fake-id-124',
           // TODO(dominickramer): This path can be lest strict when this file
           // has been
           //       converted to Typescript.
           location: {path: 'build/test/test-v8debugapi-code.js', line: 6},
           expressions: ['A']
         } as {} as stackdriver.Breakpoint;
         const oldMaxProps = config.capture.maxProperties;
         const oldMaxData = config.capture.maxDataSize;
         config.capture.maxProperties = 5;
         config.capture.maxDataSize = 1;
         api.set(bp, (err1) => {
           assert.ifError(err1);
           api.wait(bp, (err2) => {
             assert.ifError(err2);
             const foo = bp.evaluatedExpressions[0];
             const fooVal = bp.variableTable[foo!.varTableIndex!];
             assert(fooVal!.status!.description.format.match(
                 'Max data size reached'));
             assert(fooVal!.status!.isError);

             api.clear(bp, (err3) => {
               config.capture.maxDataSize = oldMaxData;
               config.capture.maxProperties = oldMaxProps;
               assert.ifError(err3);
               done();
             });
           });
           process.nextTick(() => {
             code.foo(2);
           });
         });
       });

    it('should display an error for an evaluated object beyond maxDataSize',
       (done) => {
         // TODO(dominickramer): Have this actually implement Breakpoint
         const bp: stackdriver.Breakpoint = {
           id: 'fake-id-124',
           // TODO(dominickramer): This path can be lest strict when this file
           // has been
           //       converted to Typescript.
           location: {path: 'build/test/test-v8debugapi-code.js', line: 6},
           expressions: ['B']
         } as {} as stackdriver.Breakpoint;
         const oldMaxProps = config.capture.maxProperties;
         const oldMaxData = config.capture.maxDataSize;
         config.capture.maxProperties = 5;
         config.capture.maxDataSize = 1;
         api.set(bp, (err1) => {
           assert.ifError(err1);
           api.wait(bp, (err2) => {
             assert.ifError(err2);
             const foo = bp.evaluatedExpressions[0];
             const fooVal = bp.variableTable[foo!.varTableIndex!];
             assert(fooVal!.status!.description.format.match(
                 'Max data size reached'));
             assert(fooVal!.status!.isError);

             api.clear(bp, (err3) => {
               config.capture.maxDataSize = oldMaxData;
               config.capture.maxProperties = oldMaxProps;
               assert.ifError(err3);
               done();
             });
           });
           process.nextTick(() => {
             code.foo(2);
           });
         });
       });

    it('should set the correct status messages if maxDataSize is reached',
       (done) => {
         // TODO(dominickramer): Have this actually implement Breakpoint
         const bp: stackdriver.Breakpoint = {
           id: 'fake-id-124',
           // TODO(dominickramer): This path can be lest strict when this file
           // has been
           //       converted to Typescript.
           location: {path: 'build/test/test-v8debugapi-code.js', line: 6},
           expressions: ['A']
         } as {} as stackdriver.Breakpoint;
         const oldMaxProps = config.capture.maxProperties;
         const oldMaxData = config.capture.maxDataSize;
         config.capture.maxProperties = 1;
         config.capture.maxDataSize = 1;
         api.set(bp, (err1) => {
           assert.ifError(err1);
           api.wait(bp, (err2) => {
             assert.ifError(err2);

             const bResults = bp.stackFrames[0].locals.filter((value) => {
               return value.name === 'B';
             });
             assert(bResults);
             assert.strictEqual(bResults.length, 1);

             const bArray = bResults[0];
             assert(bArray);
             assert(bArray.status!.description.format.match(
                 'Max data size reached'));
             assert(bArray.status!.isError);

             api.clear(bp, (err3) => {
               config.capture.maxDataSize = oldMaxData;
               config.capture.maxProperties = oldMaxProps;
               assert.ifError(err3);
               done();
             });
           });
           process.nextTick(() => {
             code.foo(2);
           });
         });
       });

    it('should capture without values for invalid watch expressions',
       (done) => {
         // clone a clean breakpointInFoo
         // TODO(dominickramer): Have this actually implement Breakpoint
         const bp: stackdriver.Breakpoint = {
           id: breakpointInFoo.id,
           location: breakpointInFoo.location,
           expressions:
               [':)', 'process()', 'process=this', 'i', 'process._not._def']
         } as {} as stackdriver.Breakpoint;
         api.set(bp, (err1) => {
           assert.ifError(err1);
           api.wait(bp, (err2) => {
             assert.ifError(err2);
             assert.ok(bp.stackFrames);
             assert.ok(bp.variableTable);
             assert.ok(bp.evaluatedExpressions);

             for (const i in bp.evaluatedExpressions) {
               if (i) {
                 const expr = bp.evaluatedExpressions[i];
                 assert(expr!.status && expr!.status!.isError);
               }
             }

             api.clear(bp, (err3) => {
               assert.ifError(err3);
               done();
             });
           });
           process.nextTick(() => {
             code.foo(3);
           });
         });
       });

    it('should be possible to set conditional breakpoints', (done) => {
      // clone a clean breakpointInFoo
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp: stackdriver.Breakpoint = {
        id: breakpointInFoo.id,
        location: breakpointInFoo.location,
        condition: 'n===5'
      } as {} as stackdriver.Breakpoint;
      api.set(bp, (err1) => {
        assert.ifError(err1);
        api.wait(bp, (err2) => {
          assert.ifError(err2);
          assert.ok(bp.stackFrames);

          const topFrame = bp.stackFrames[0];
          assert.strictEqual(topFrame.locals[0].name, 'n');
          assert.strictEqual(topFrame.locals[0].value, '5');
          api.clear(bp, (err3) => {
            assert.ifError(err3);
            done();
          });
        });
        process.nextTick(() => {
          code.foo(4);
          code.foo(5);
        });
      });
    });

    it('should be possible to set conditional breakpoints in coffeescript',
       (done) => {
         // TODO(dominickramer): Have this actually implement Breakpoint
         const bp: stackdriver.Breakpoint = {
           id: 'coffee-id-1729',
           // TODO(dominickramer): Determine if this path should contain 'build'
           location: {
             path: path.join(
                 '.', 'build', 'test', 'fixtures', 'coffee',
                 'transpile.coffee'),
             line: 3
           },
           condition: 'if n == 3 then true else false'
         } as {} as stackdriver.Breakpoint;
         const tt = require('./fixtures/coffee/transpile');
         api.set(bp, (err1) => {
           assert.ifError(err1);
           api.wait(bp, (err2) => {
             assert.ifError(err2);
             assert.ok(bp.stackFrames);

             const topFrame = bp.stackFrames[0];
             assert.strictEqual(topFrame['function'], 'foo');
             assert.strictEqual(topFrame.locals[0].name, 'n');
             assert.strictEqual(topFrame.locals[0].value, '3');
             api.clear(bp, (err3) => {
               assert.ifError(err3);
               done();
             });
           });
           process.nextTick(() => {
             tt.foo(2);
             tt.foo(3);
           });
         });
       });

    it('should show error for invalid conditions in coffeescript', (done) => {
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp: stackdriver.Breakpoint = {
        id: 'coffee-id-1729',
        location: {
          path:
              path.join('.', 'test', 'fixtures', 'coffee', 'transpile.coffee'),
          line: 3
        },
        condition: 'process=false'
      } as {} as stackdriver.Breakpoint;
      api.set(bp, (err) => {
        assert(err);
        assert.strictEqual(err!.message, 'Error compiling condition.');
        done();
      });
    });

    it('should be possible to set conditional breakpoints with babel',
       (done) => {
         // TODO(dominickramer): Have this actually implement Breakpoint
         const bp: stackdriver.Breakpoint = {
           id: 'babel-id-1729',
           // TODO(dominickramer): Determine if this path should contain 'build'
           location: {
             path: path.join(
                 '.', 'build', 'test', 'fixtures', 'es6', 'transpile.es6'),
             line: 2
           },
           condition: 'i + j === 3'
         } as {} as stackdriver.Breakpoint;
         const tt = require('./fixtures/es6/transpile');
         api.set(bp, (err1) => {
           assert.ifError(err1);
           api.wait(bp, (err2) => {
             assert.ifError(err2);
             assert.ok(bp.stackFrames);

             const topFrame = bp.stackFrames[0];
             assert.strictEqual(topFrame.locals[0].name, 'j');
             assert.strictEqual(topFrame.locals[0].value, '2');
             assert.strictEqual(topFrame['function'], 'foo');
             api.clear(bp, (err3) => {
               assert.ifError(err3);
               done();
             });
           });
           process.nextTick(() => {
             tt.foo(1);
             tt.foo(2);
           });
         });
       });

    it('should be possible to view watch expressions in coffeescript',
       (done) => {
         // TODO(dominickramer): Have this actually implement Breakpoint
         const bp: stackdriver.Breakpoint = {
           id: 'coffee-id-1729',
           // TODO(dominickramer): Determine if this path should contain 'build'
           location: {
             path: path.join(
                 '.', 'build', 'test', 'fixtures', 'coffee',
                 'transpile.coffee'),
             line: 3
           },
           expressions: ['if n == 3 then Math.PI * n else n']
         } as {} as stackdriver.Breakpoint;
         const tt = require('./fixtures/coffee/transpile');
         api.set(bp, (err1) => {
           assert.ifError(err1);
           api.wait(bp, (err2) => {
             assert.ifError(err2);
             assert.ok(bp.stackFrames);
             assert.ok(bp.variableTable);
             assert.ok(bp.evaluatedExpressions);

             for (const i in bp.evaluatedExpressions) {
               if (i) {
                 const expr = bp.evaluatedExpressions[i];
                 assert(expr!.value === String(Math.PI * 3));
               }
             }

             api.clear(bp, (err3) => {
               assert.ifError(err3);
               done();
             });
           });
           process.nextTick(() => {
             tt.foo(3);
           });
         });
       });

    it('should capture without values for invalid watch expressions in coffeescript',
       done => {
         // TODO(dominickramer): Have this actually implement Breakpoint
         const bp: stackdriver.Breakpoint = {
           id: 'coffee-id-1729',
           // TODO(dominickramer): Determine if this path should contain 'build'
           location: {
             path: path.join(
                 '.', 'build', 'test', 'fixtures', 'coffee',
                 'transpile.coffee'),
             line: 3
           },
           expressions:
               [':)', 'n n, n', 'process=this', '((x) -> x x) n', 'return']
         } as {} as stackdriver.Breakpoint;
         const tt = require('./fixtures/coffee/transpile');
         api.set(bp, err => {
           assert.ifError(err);
           api.wait(bp, err => {
             assert.ifError(err);
             assert.ok(bp.stackFrames);
             assert.ok(bp.variableTable);
             assert.ok(bp.evaluatedExpressions);

             for (const rawExpr of bp.evaluatedExpressions) {
               assert(rawExpr);
               const expr = rawExpr!;
               assert(expr.status);
               const status = expr.status!;
               assert(status.isError);
               if (expr.name === ':)' || expr.name === 'process=this' ||
                   expr.name === 'return' || expr.name === '((x) -> x x) n') {
                 assert.strictEqual(
                     status.description.format, 'Error Compiling Expression');
               } else {
                 assert(
                     status.description.format.match(
                         'Expression not allowed') ||
                     status.description.format.match('TypeError'));
               }
             }

             api.clear(bp, err => {
               assert.ifError(err);
               done();
             });
           });
           process.nextTick(() => {
             tt.foo(3);
           });
         });
       });

    it('should remove listener when breakpoint is cleared before hitting',
       (done) => {
         // TODO(dominickramer): Have this actually implement Breakpoint
         const bp: stackdriver.Breakpoint = {
           id: breakpointInFoo.id,
           location: breakpointInFoo.location,
           condition: 'n===447'
         } as {} as stackdriver.Breakpoint;
         api.set(bp, (err1) => {
           assert.ifError(err1);
           api.wait(bp, () => {
             assert(false, 'should not reach here');
           });
           process.nextTick(() => {
             code.foo(6);
             process.nextTick(() => {
               api.clear(bp, (err2) => {
                 assert.ifError(err2);
                 assert(stateIsClean(api));
                 done();
               });
             });
           });
         });
       });

    it('should be possible to set multiple breakpoints at once', (done) => {
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp1: stackdriver.Breakpoint = {
        id: 'bp1',
        location: {path: __filename, line: 5}
      } as {} as stackdriver.Breakpoint;
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp2: stackdriver.Breakpoint = {
        id: 'bp2',
        location: {path: __filename, line: 6}
      } as {} as stackdriver.Breakpoint;
      api.set(bp1, (err1) => {
        assert.ifError(err1);
        api.set(bp2, (err2) => {
          assert.ifError(err2);
          assert.strictEqual(api.numBreakpoints_(), 2);
          api.clear(bp1, (err3) => {
            assert.ifError(err3);
            assert.strictEqual(api.numBreakpoints_(), 1);
            api.clear(bp2, (err4) => {
              assert.ifError(err4);
              assert.strictEqual(api.numBreakpoints_(), 0);
              done();
            });
          });
        });
      });
    });


    it('should correctly stop on line-1 breakpoints', (done) => {
      const foo = require('./fixtures/foo.js');
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp: stackdriver.Breakpoint = {
        id: 'bp-line-1',
        location: {path: 'foo.js', line: 1, column: 45}
      } as {} as stackdriver.Breakpoint;
      api.set(bp, (err1) => {
        assert.ifError(err1);
        api.wait(bp, (err2) => {
          assert.ifError(err2);
          assert.ok(bp.stackFrames);

          api.clear(bp, (err3) => {
            assert.ifError(err3);
            done();
          });
        });
        process.nextTick(() => {
          foo();
        });
      });
    });

    it('should not silence errors thrown in the wait callback', (done) => {
      const message = 'This exception should not be silenced';
      // Remove the mocha listener.
      const listeners = process.listeners('uncaughtException');
      assert.strictEqual(listeners.length, 1);
      const originalListener = listeners[0];
      process.removeListener('uncaughtException', originalListener);
      process.once('uncaughtException', (err: Error) => {
        assert.ok(err);
        assert.strictEqual(err.message, message);
        // Restore the mocha listener.
        process.on('uncaughtException', originalListener);
        done();
      });

      // clone a clean breakpointInFoo
      // TODO(dominickramer): Have this actually implement Breakpoint
      const bp: stackdriver.Breakpoint = {
        id: breakpointInFoo.id,
        location: breakpointInFoo.location
      } as {} as stackdriver.Breakpoint;
      api.set(bp, (err1) => {
        assert.ifError(err1);
        // TODO(dominickramer): Determine if the err parameter should be used.
        api.wait(bp, (err2) => {
          api.clear(bp, (err3) => {
            assert.ifError(err3);
            throw new Error(message);
          });
        });
        process.nextTick(() => {
          code.foo(1);
        });
      });
    });

    it('should capture state in transpiled TS async functions', (done) => {
      const bp: stackdriver.Breakpoint = {
        id: 'async-id-1',
        location: {
          path: path.join('.', 'test', 'fixtures', 'ts', 'async.js'),
          line: 71
        }
      } as {} as stackdriver.Breakpoint;

      const run = require('./fixtures/ts/async.js');
      api.set(bp, (err1) => {
        assert.ifError(err1);
        api.wait(bp, (err2) => {
          assert.ifError(err2);
          assert.ok(bp.stackFrames);

          const topFrame = bp.stackFrames[0];
          assert.ok(topFrame.locals.some((local) => (local.name === '_a')));
          assert.ok(topFrame.locals.some((local) => (local.name === 'res')));
          api.clear(bp, (err3) => {
            assert.ifError(err3);
            done();
          });
        });
      });
      process.nextTick(run);
    });
  });

  it('should be possible to set deferred breakpoints');
});

describe('v8debugapi.findScripts', () => {
  it('should properly handle appPathRelativeToRepository', () => {
    const config = extend(true, {}, undefined!, {
      workingDirectory: path.join('some', 'strange', 'directory'),
      appPathRelativeToRepository: path.join('my', 'project', 'root')
    });

    const logger = new MockLogger();

    const fakeFileStats = {
      [path.join(
          'some', 'strange', 'directory', 'test', 'fixtures', 'a', 'hello.js')]:
          {hash: 'fake', lines: 5},
      [path.join('my', 'project', 'root', 'test', 'fixtures', 'a', 'hello.js')]:
          {hash: 'fake', lines: 50}
    };
    const scriptPath =
        path.join('my', 'project', 'root', 'test', 'fixtures', 'a', 'hello.js');
    const result = utils.findScripts(scriptPath, config, fakeFileStats, logger);
    assert.deepStrictEqual(result, [path.join(
                                       'some', 'strange', 'directory', 'test',
                                       'fixtures', 'a', 'hello.js')]);
    assert.strictEqual(logger.allCalls().length, 0);
  });

  it('should invoke pathResolver if provided', () => {
    const config = extend(true, {}, undefined!, {
      pathResolver(
          scriptPath: string, knownFiles: string[], resolved: string[]) {
        return [path.join('build', scriptPath)];
      },
    });

    const fakeFileStats = {
      [path.join('build', 'index.js')]: {hash: 'fake', lines: 5},
      [path.join('build', 'some', 'subdir', 'index.js')]:
          {hash: 'fake', lines: 5},
    };

    const logger = new MockLogger();

    assert.deepEqual(
        utils.findScripts('index.js', config, fakeFileStats, logger),
        [path.join('build', 'index.js')]);
    assert.strictEqual(logger.allCalls().length, 0);
  });

  it('should not invoke pathResolver if not provided', () => {
    const config = extend(true, {}, undefined!);

    const fakeFileStats = {
      [path.join('build', 'index.js')]: {hash: 'fake', lines: 5},
      [path.join('build', 'some', 'subdir', 'index.js')]:
          {hash: 'fake', lines: 5},
    };

    const logger = new MockLogger();

    assert.deepEqual(
        utils.findScripts('index.js', config, fakeFileStats, logger), [
          path.join('build', 'index.js'),
          path.join('build', 'some', 'subdir', 'index.js')
        ]);
    assert.strictEqual(logger.allCalls().length, 0);
  });

  it('should use default resolved paths if pathResolver returns undefined',
     () => {
       const config = extend(true, {}, undefined!, {
         pathResolver(
             scriptPath: string, knownFiles: string[], resolved: string[]) {
           return undefined;
         },
       });

       const fakeFileStats = {
         [path.join('build', 'index.js')]: {hash: 'fake', lines: 5},
         [path.join('build', 'some', 'subdir', 'index.js')]:
             {hash: 'fake', lines: 5},
       };

       const logger = new MockLogger();

       assert.deepEqual(
           utils.findScripts('index.js', config, fakeFileStats, logger), [
             path.join('build', 'index.js'),
             path.join('build', 'some', 'subdir', 'index.js')
           ]);
       assert.strictEqual(logger.allCalls().length, 0);
     });

  it('should warn if pathResolver returns a path unknown to the agent', () => {
    const config = extend(true, {}, undefined!, {
      pathResolver(
          scriptPath: string, knownFiles: string[], resolved: string[]) {
        return [path.join('some', 'unknown', 'path')];
      },
    });

    const fakeFileStats = {
      [path.join('build', 'index.js')]: {hash: 'fake', lines: 5},
      [path.join('build', 'some', 'subdir', 'index.js')]:
          {hash: 'fake', lines: 5},
    };

    const logger = new MockLogger();

    // The default resolved files should be used if the path resolver
    // returns a path unknown to the debug agent.
    assert.deepEqual(
        utils.findScripts('index.js', config, fakeFileStats, logger), [
          path.join('build', 'index.js'),
          path.join('build', 'some', 'subdir', 'index.js')
        ]);
    assert.strictEqual(logger.allCalls().length, 1);
    assert.strictEqual(logger.warns.length, 1);
    const message = logger.warns[0].args[0];
    assert.notStrictEqual(
        message.indexOf(path.join('some', 'unknown', 'path')), -1);
    assert.notStrictEqual(
        message.indexOf('not in the list of paths known to the debug agent'),
        -1);
  });

  it('should warn if pathResolver returns an invalid return type', () => {
    const config = extend(true, {}, undefined!, {
      pathResolver(
          scriptPath: string, knownFiles: string[], resolved: string[]) {
        return {x: 'some value', y: 'some other value'};
      },
    });

    const fakeFileStats = {
      [path.join('build', 'index.js')]: {hash: 'fake', lines: 5},
      [path.join('build', 'some', 'subdir', 'index.js')]:
          {hash: 'fake', lines: 5},
    };

    const logger = new MockLogger();

    // The default resolved files should be used in this case.
    assert.deepEqual(
        utils.findScripts('index.js', config, fakeFileStats, logger), [
          path.join('build', 'index.js'),
          path.join('build', 'some', 'subdir', 'index.js')
        ]);
    assert.strictEqual(logger.allCalls().length, 1);
    assert.strictEqual(logger.warns.length, 1);
    const message = logger.warns[0].args[0];
    assert.notStrictEqual(
        message.indexOf(
            'returned a value other than \'undefined\' or an array of strings'),
        -1);
  });

  it('should warn if pathResolver returns an array containing a non-string',
     () => {
       const config = extend(true, {}, undefined!, {
         pathResolver(
             scriptPath: string, knownFiles: string[], resolved: string[]) {
           return [{x: 'some value', y: 'some other value'}];
         },
       });

       const fakeFileStats = {
         [path.join('build', 'index.js')]: {hash: 'fake', lines: 5},
         [path.join('build', 'some', 'subdir', 'index.js')]:
             {hash: 'fake', lines: 5},
       };

       const logger = new MockLogger();

       // The default resolved files should be used in this case.
       assert.deepEqual(
           utils.findScripts('index.js', config, fakeFileStats, logger), [
             path.join('build', 'index.js'),
             path.join('build', 'some', 'subdir', 'index.js')
           ]);
       assert.strictEqual(logger.allCalls().length, 1);
       assert.strictEqual(logger.warns.length, 1);
       const message = logger.warns[0].args[0];
       assert.notStrictEqual(
           message.indexOf(
               'that is not in the list of paths known to the debug agent'),
           -1);
     });

  it('should warn if pathResolver is not a function', () => {
    const config = extend(true, {}, undefined!, {pathResolver: 'some value'});

    const fakeFileStats = {
      [path.join('build', 'index.js')]: {hash: 'fake', lines: 5},
      [path.join('build', 'some', 'subdir', 'index.js')]:
          {hash: 'fake', lines: 5},
    };

    const logger = new MockLogger();

    // The default resolved files should be used in this case.
    assert.deepEqual(
        utils.findScripts('index.js', config, fakeFileStats, logger), [
          path.join('build', 'index.js'),
          path.join('build', 'some', 'subdir', 'index.js')
        ]);
    assert.strictEqual(logger.allCalls().length, 1);
    assert.strictEqual(logger.warns.length, 1);
    const message = logger.warns[0].args[0];
    assert.notStrictEqual(
        message.indexOf('The \'pathResolver\' config must be a function'), -1);
  });
});

describe('v8debugapi.findScriptsFuzzy', () => {
  const fuzzy = utils.findScriptsFuzzy;

  it('should not confuse . as a regexp pattern', () => {
    assert.deepStrictEqual(fuzzy('foo.js', ['/fooXjs']), []);
  });

  it('should do suffix matches correctly', () => {
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

    TESTS.forEach((test) => {
      const scriptPath = path.normalize(test.scriptPath);
      const fileList = test.fileList.map(path.normalize);
      const result = test.result.map(path.normalize);
      assert.deepStrictEqual(fuzzy(scriptPath, fileList), result);
    });
  });
});
