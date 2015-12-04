/*1* KEEP THIS CODE AT THE TOP TO AVOID LINE NUMBER CHANGES */
/*2*/'use strict';
/*3*/function foo(n) {
/*4*/  return n+42;
/*5*/}
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

var breakpointInFoo = {
  id: 'fake-id-123',
  location: { path: 'test-v8debugapi.js', line: 4 }
};

var assert = require('assert');
var v8debugapi = require('../lib/v8debugapi.js');
var logModule = require('@google/cloud-diagnostics-common').logger;
var config = require('../config.js');
var StatusMessage = require('../lib/apiclasses.js').StatusMessage;
var scanner = require('../lib/scanner.js');

function stateIsClean(api) {
  assert.equal(api.numBreakpoints_(), 0,
    'there should be no breakpoints active');
  assert.equal(api.numListeners_(), 0,
    'there should be no listeners active');
  return true;
}

describe('v8debugapi', function() {
  config.workingDirectory = process.cwd() + '/test';
  var logger = logModule.create(config.logLevel);
  var api = null;

  beforeEach(function(done) {
    if (!api) {
      scanner.scan(config.workingDirectory, function(err, hash, fileStats) {
        assert(!err);
        api = v8debugapi.create(logger, config, fileStats);
        assert.ok(api, 'should be able to create the api');
        done();
      });
    } else {
      assert(stateIsClean(api));
      done();
    }
  });
  afterEach(function() { assert(stateIsClean(api)); });

  it('should be able to set and remove breakpoints', function(done) {
    // clone a clean breakpointInFoo
    var bp = {id: breakpointInFoo.id, location: breakpointInFoo.location};
    api.set(bp, function(err) {
      assert.ifError(err);
      assert.equal(api.numBreakpoints_(), 1);
      api.clear(bp);
      done();
    });
  });

  it('should accept breakpoint with ids 0 as a valid breakpoint',
    function(done) {
      var bp = { id: 0, location: breakpointInFoo.location};
      api.set(bp, function(err) {
        assert.ifError(err);
        api.clear(bp);
        done();
      });
    });

  it('should set error for breakpoint in non-js files',
    function(done) {
      require('./fixtures/key-bad.json');
      var bp = { id: 0, location: {line: 1, path: 'fixtures/key-bad.json'}};
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
      var bp = { id: 0, location: {line: 1, path: '/test/foo.js'}};
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
      var bp = { id: 0, location: {line: 1, path: '/Server/a/hello.js'}};
      api.set(bp, function(err) {
        assert.ifError(err);
        api.clear(bp);
        done();
      });
    });

  describe('invalid breakpoints', function() {
    var badBreakpoints = [
      {},
      { id: 'with no location'},
      { id: 'with bad location', location: {}},
      { id: 'with no path', location: {line: 4}},
      { id: 'with no line', location: {path: 'foo.js'}},
      { id: 'with incomplete path', location: {path: 'st-v8debugapi.js', line: 4}}
    ];

    badBreakpoints.forEach(function(bp) {
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
      var bp = {id: 'ambiguous', location: {line: 1, path: 'hello.js'}};
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
      var bp = {
        id: 'non-existent line',
        location: {path: './fixtures/foo.js', line: 500}
      };
      api.set(bp, function(err) {
        assert.ok(err);
        assert.ok(bp.status);
        assert.ok(bp.status instanceof StatusMessage);
        assert.ok(bp.status.isError);
        assert(bp.status.description.format ===
          api.messages.INVALID_LINE_NUMBER);
        done();
      });
    });

  });

  function conditionTests(subject, test, expressions) {
    describe(subject, function() {
      expressions.forEach(function(expr) {
        it('should validate breakpoint with condition "'+expr+'"', function(done) {
          // make a clean copy of breakpointInFoo
          var bp = {
            id: breakpointInFoo.id,
            location: breakpointInFoo.location,
            condition: expr
          };
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
    'var x = 1;',
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
    '[1, 2, 3, 4, x = 1, x == 1, x === 1]'
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
    '[1, 2, 3, 4, x == 1, x === 1, null, undefined]'
  ]);

  describe('path normalization', function() {
    var breakpoints = [
      { id: 'path0', location: {line: 4, path: '/test/test-v8debugapi.js'}},
      { id: 'path1', location: {line: 4, path: 'test/test-v8debugapi.js' }},
      { id: 'path2', location: {line: 4, path: __filename }},
      { id: 'with . in path', location: {path: 'test/./test-v8debugapi.js', line: 4}},
      { id: 'with . in path', location: {path: './test-v8debugapi.js', line: 4}},
      { id: 'with .. in path', location: {path: 'test/../test-v8debugapi.js', line: 4}},
      { id: 'with .. in path', location: {path: '../test/test-v8debugapi.js', line: 4}}
    ];

    breakpoints.forEach(function(bp) {
      it('should handle breakpoint as ' + bp.location.path, function(done) {
        api.set(bp, function(err) {
          assert.ifError(err);
          api.wait(bp, function(err) {
            assert.ifError(err);
            api.clear(bp);
            done();
          });
          process.nextTick(function() {foo(7);});
        });
      });
    });
  });

  describe('set and wait', function() {

    it('should be possible to wait on a breakpoint', function(done) {
      // clone a clean breakpointInFoo
      var bp = {id: breakpointInFoo.id, location: breakpointInFoo.location};
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);
          api.clear(bp);
          done();
        });
        process.nextTick(function() {foo(1);});
      });

    });

    it('should capture state', function(done) {
      // clone a clean breakpointInFoo
      var bp  = {id: breakpointInFoo.id, location: breakpointInFoo.location};
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);
          assert.ok(bp.stackFrames);
          assert.ok(bp.variableTable);

          var topFrame = bp.stackFrames[0];
          assert.ok(topFrame);
          assert.equal(topFrame['function'], 'foo');
          assert.equal(topFrame.arguments[0].name, 'n');
          assert.equal(topFrame.arguments[0].value, '2');
          api.clear(bp);
          done();
        });
      process.nextTick(function() {foo(2);});
      });
    });

    it('should capture state with watch expressions', function(done) {
      // clone a clean breakpointInFoo
      var bp  = {
        id: breakpointInFoo.id,
        location: breakpointInFoo.location,
        expressions: ['process']
      };
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);
          assert.ok(bp.stackFrames);
          assert.ok(bp.variableTable);
          assert.ok(bp.evaluatedExpressions);

          var topFrame = bp.stackFrames[0];
          assert.equal(topFrame['function'], 'foo');
          assert.equal(topFrame.arguments[0].name, 'n');
          assert.equal(topFrame.arguments[0].value, '3');

          var watch = bp.evaluatedExpressions[0];
          assert.equal(watch.name, 'process');
          assert.ok(watch.varTableIndex);

          api.clear(bp);
          done();
        });
        process.nextTick(function() {foo(3);});
      });

    });

    it('should capture without values for invalid watch expressions', function(done) {
      // clone a clean breakpointInFoo
      var bp  = {
        id: breakpointInFoo.id,
        location: breakpointInFoo.location,
        expressions: [':)', 'process()', 'process=this']
      };
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);
          assert.ok(bp.stackFrames);
          assert.ok(bp.variableTable);
          assert.ok(bp.evaluatedExpressions);

          for (var i in bp.evaluatedExpressions) {
            var expr = bp.evaluatedExpressions[i];
            assert(expr.status && expr.status.isError);
          }

          api.clear(bp);
          done();
        });
        process.nextTick(function() {foo(3);});
      });

    });

    it('should be possible to set conditional breakpoints', function (done) {
      // clone a clean breakpointInFoo
      var bp  = {
        id: breakpointInFoo.id,
        location: breakpointInFoo.location,
        condition: 'n===5'
      };
      api.set(bp, function(err) {
        assert.ifError(err);
        api.wait(bp, function(err) {
          assert.ifError(err);
          assert.ok(bp.stackFrames);

          var topFrame = bp.stackFrames[0];
          assert.equal(topFrame['function'], 'foo');
          assert.equal(topFrame.arguments[0].name, 'n');
          assert.equal(topFrame.arguments[0].value, '5');
          api.clear(bp);
          done();
        });
        process.nextTick(function() {foo(4); foo(5);});
      });

    });

    it('should be possible to set conditional breakpoints in coffeescript',
      function (done) {
        var bp = {
          id: 'coffee-id-1729',
          location: { path: './test/fixtures/coffee/transpile.coffee',
            line: 3 },
          condition: 'if n == 3 then true else false'
        };
        var tt = require('./fixtures/coffee/transpile');
        api.set(bp, function(err) {
          assert.ifError(err);
          api.wait(bp, function(err) {
            assert.ifError(err);
            assert.ok(bp.stackFrames);

            var topFrame = bp.stackFrames[0];
            assert.equal(topFrame['function'], 'foo');
            assert.equal(topFrame.arguments[0].name, 'n');
            assert.equal(topFrame.arguments[0].value, '3');
            api.clear(bp);
            done();
          });
          process.nextTick(function() {tt.foo(2); tt.foo(3);});
        });
    });

    it('should be possible to set conditional breakpoints with babel',
      function (done) {
        var bp = {
          id: 'babel-id-1729',
          location: { path: './test/fixtures/es6/transpile.es6',
            line: 3 },
          condition: 'i + j === 3'
        };
        var tt = require('./fixtures/es6/transpile');
        api.set(bp, function(err) {
          assert.ifError(err);
          api.wait(bp, function(err) {
            assert.ifError(err);
            assert.ok(bp.stackFrames);

            var topFrame = bp.stackFrames[0];
            assert.equal(topFrame['function'], 'foo');
            assert.equal(topFrame.arguments[0].name, 'j');
            assert.equal(topFrame.arguments[0].value, '2');
            api.clear(bp);
            done();
          });
          process.nextTick(function() {tt.foo(1); tt.foo(2);});
        });
    });

    it('should be possible to view watch expressions in coffeescript',
      function(done) {
        var bp = {
            id: 'coffee-id-1729',
            location: { path: './test/fixtures/coffee/transpile.coffee',
              line: 3 },
            expressions: ['if n == 3 then Math.PI * n else n']
          };
        var tt = require('./fixtures/coffee/transpile');
        api.set(bp, function(err) {
          assert.ifError(err);
          api.wait(bp, function(err) {
            assert.ifError(err);
            assert.ok(bp.stackFrames);
            assert.ok(bp.variableTable);
            assert.ok(bp.evaluatedExpressions);

            for (var i in bp.evaluatedExpressions) {
              var expr = bp.evaluatedExpressions[i];
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
        var bp = {
            id: 'coffee-id-1729',
            location: { path: './test/fixtures/coffee/transpile.coffee',
              line: 3 },
            expressions: [':)', 'n n, n', 'process=this', '((x) -> x x) n', 'return']
          };
        var tt = require('./fixtures/coffee/transpile');
        api.set(bp, function(err) {
          assert.ifError(err);
          api.wait(bp, function(err) {
            assert.ifError(err);
            assert.ok(bp.stackFrames);
            assert.ok(bp.variableTable);
            assert.ok(bp.evaluatedExpressions);

            for (var i in bp.evaluatedExpressions) {
              var expr = bp.evaluatedExpressions[i];
              assert(expr.status && expr.status.isError);
            }

            api.clear(bp);
            done();
          });
          process.nextTick(function() {tt.foo(3);});
        });
      });

    it('should remove listener when breakpoint is cleared before hitting',
      function(done) {
        var bp  = {
          id: breakpointInFoo.id,
          location: breakpointInFoo.location,
          condition: 'n===447'
        };
        api.set(bp, function(err) {
          assert.ifError(err);
          api.wait(bp, function() {
            assert(false, 'should not reach here');
          });
          process.nextTick(function() {
            foo(6);
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
        var bp1 = { id: 'bp1', location: { path: __filename, line: 4 }};
        var bp2 = { id: 'bp2', location: { path: __filename, line: 5 }};
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
      var foo = require('./fixtures/foo.js');
      var bp = { id: 'bp-line-1', location: {
        path: 'foo.js',
        line: 1,
        column: 45
      }};
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
  });

  it('should be possible to set deferred breakpoints');
  it('should be possible to access intercepted properties');
});
