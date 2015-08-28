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
var Logger = require('../lib/logger.js');
var config = require('../config.js');
var StatusMessage = require('../lib/apiclasses.js').StatusMessage;

function stateIsClean(api) {
  assert.equal(api.numBreakpoints_(), 0,
    'there should be no breakpoints active');
  assert.equal(api.numListeners_(), 0,
    'there should be no listeners active');
  return true;
}

describe('v8debugapi', function() {
  config.cwd = process.cwd() + '/test';
  var logger = new Logger(config.logLevel);

  var api = v8debugapi.create(logger, config);
  assert.ok(api, 'should be able to create the api');

  beforeEach(function() { assert(stateIsClean(api)); });
  afterEach(function() { assert(stateIsClean(api)); });

  it('should be able to set and remove breakpoints', function() {
    // clone a clean breakpointInFoo
    var bp = {id: breakpointInFoo.id, location: breakpointInFoo.location};
    var result = api.set(bp);
    assert.ok(result);
    assert.equal(api.numBreakpoints_(), 1);
    api.clear(bp);
  });

  it('should accept breakpoint with ids 0 as a valid breakpoint',
    function() {
      var bp = { id: 0, location: breakpointInFoo.location};
      var result = api.set(bp);
      assert.ok(result);
      api.clear(bp);
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
      it('should reject breakpoint ' + bp.id, function() {
        var result = api.set(bp);
        assert(result === false, 'should return false');
        assert.ok(bp.status);
        assert.ok(bp.status instanceof StatusMessage);
        assert.ok(bp.status.isError);
      });
    });

    it('should reject breakpoint when filename is ambiguous', function() {
      require('./fixtures/a/hello.js');
      require('./fixtures/b/hello.js');
      var bp = {id: 'ambiguous', location: {line: 1, path: 'hello.js'}};
      var result = api.set(bp);
      assert(result === false);
      assert.ok(bp.status);
      assert.ok(bp.status instanceof StatusMessage);
      assert.ok(bp.status.isError);
      assert(bp.status.description.format ===
        api.messages.SOURCE_FILE_AMBIGUOUS);
    });
  });

  function conditionTests(subject, test, expressions) {
    describe(subject, function() {
      expressions.forEach(function(expr) {
        it('should validate breakpoint with condition "'+expr+'"', function() {
          // make a clean copy of breakpointInFoo
          var bp = {
            id: breakpointInFoo.id,
            location: breakpointInFoo.location,
            condition: expr
          };
          var result = api.set(bp);
          test(result);
          api.clear(bp);
        });
      });
    });
  }
  conditionTests('invalid conditions', function(result) { assert(!result); }, [
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
    'x++'
  ]);
  conditionTests('valid conditions', assert, [
    'x == 1',
    'x === 1',
    'global <= 1',
    'this + 1',
    '!this',
    'this?this:1',
    '{f: this?1:2}',
    '{f: process.env}',
    '1,2,3,{f:2},4',
    'A[this?this:1]'
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
        var result = api.set(bp);
        assert.ok(result);
        api.wait(bp, function(err) {
          assert.ifError(err);
          api.clear(bp);
          done();
        });
        process.nextTick(function() {foo(7);});
      });
    });
  });

  describe('set and wait', function() {

    it('should be possible to wait on a breakpoint', function(done) {
      // clone a clean breakpointInFoo
      var bp = {id: breakpointInFoo.id, location: breakpointInFoo.location};
      var result = api.set(bp);
      assert.ok(result);
      api.wait(bp, function(err) {
        assert.ifError(err);
        api.clear(bp);
        done();
      });
      process.nextTick(function() {foo(1);});
    });

    it('should capture state', function(done) {
      // clone a clean breakpointInFoo
      var bp  = {id: breakpointInFoo.id, location: breakpointInFoo.location};
      var result = api.set(bp);
      assert.ok(result);
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

    it('should capture state with watch expressions', function(done) {
      // clone a clean breakpointInFoo
      var bp  = {
        id: breakpointInFoo.id,
        location: breakpointInFoo.location,
        expressions: ['process']
      };
      var result = api.set(bp);
      assert.ok(result);
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
        assert.ok(watch.varIndex);

        api.clear(bp);
        done();
      });
      process.nextTick(function() {foo(3);});
    });

    it('should capture without values for invalid watch expressions', function(done) {
      // clone a clean breakpointInFoo
      var bp  = {
        id: breakpointInFoo.id,
        location: breakpointInFoo.location,
        expressions: [':)', 'process()', 'process=this']
      };
      var result = api.set(bp);
      assert.ok(result);
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

    it('should be possible to set conditional breakpoints', function (done) {
      // clone a clean breakpointInFoo
      var bp  = {
        id: breakpointInFoo.id,
        location: breakpointInFoo.location,
        condition: 'n===5'
      };
      var result = api.set(bp);
      assert.ok(result);
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

    it('should be possible to set conditional breakpoints in compiled code',
      function (done) {
        var bp = {
          id: 'coffee-id-1729',
          location: { path: './test/fixtures/coffee/transpile.coffee',
            line: 3 },
          condition: 'if n == 3 then true else false'
        };
        var tt = require('./fixtures/coffee/transpile');
        var result = api.set(bp);
        assert.ok(result);
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

    it('should be possible to view watch expressions in compiled code',
      function(done) {
        var bp = {
            id: 'coffee-id-1729',
            location: { path: './test/fixtures/coffee/transpile.coffee',
              line: 3 },
            expressions: ['if n == 3 then Math.PI * n else n']
          };
        var tt = require('./fixtures/coffee/transpile');
        var result = api.set(bp);
        assert.ok(result);
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

    it('should capture without values for invalid watch expressions in compiled code',
      function(done) {
        var bp = {
            id: 'coffee-id-1729',
            location: { path: './test/fixtures/coffee/transpile.coffee',
              line: 3 },
            expressions: [':)', 'n n, n', 'process=this', '((x) -> x x) n', 'return']
          };
        var tt = require('./fixtures/coffee/transpile');
        var result = api.set(bp);
        assert.ok(result);
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

    it('should remove listener when breakpoint is cleared before hitting',
      function(done) {
        var bp  = {
          id: breakpointInFoo.id,
          location: breakpointInFoo.location,
          condition: 'n===447'
        };
        assert.ok(api.set(bp));
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

      it('should be possible to set multiple breakpoints at once', function() {
        var bp1 = { id: 'bp1', location: { path: __filename, line: 4 }};
        var bp2 = { id: 'bp2', location: { path: __filename, line: 5 }};
        assert.ok(api.set(bp1));
        assert.ok(api.set(bp2));
        assert.equal(api.numBreakpoints_(), 2);
        api.clear(bp1);
        assert.equal(api.numBreakpoints_(), 1);
        api.clear(bp2);
        assert.equal(api.numBreakpoints_(), 0);
      });

  });

  it('should be possible to set deferred breakpoints');
  it('should be possible to access intercepted properties');
});
