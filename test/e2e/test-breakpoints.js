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

process.env.GCLOUD_DEBUG_LOGLEVEL=2;

var assert = require('assert');
var util = require('util');
var GoogleAuth = require('google-auth-library');
var _ = require('lodash'); // for _.find. Can't use ES6 yet.
var cp = require('child_process');
var semver = require('semver');
var thenifyAll = require('thenify-all');
var Debugger = require('../debugger.js');

var DEBUG_API = 'https://clouddebugger.googleapis.com/v2/debugger';
var SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/cloud_debugger',
];
var CLUSTER_WORKERS = 3;

var debuggeeId;
var projectId;
var transcript = '';

var FILENAME = 'test-breakpoints.js';

var delay = function(delayTimeMS) {
  return new Promise(function(resolve, reject) {
    setTimeout(resolve, delayTimeMS);
  });
};

describe('e2e tests', function () {
  var debuggeeId;
  var projectId;
  var transcript;
  var children = [];

  beforeEach(function() {
    return new Promise(function(resolve, reject) {
      var numChildrenReady = 0;
      var handler = function(a) {
        if (a[0].length > 0) {
          reject(new Error('A child reported the following error: ' + a[0]));
        }
        if (!debuggeeId) {
          // Cache the needed info from the first worker.
          debuggeeId = a[1];
          projectId = a[2];
        } else {
          // Make sure all other workers are consistent.
          assert.equal(debuggeeId, a[1]);
          assert.equal(projectId, a[2]);
          if (debuggeeId !== a[1] || projectId !== a[2]) {
            reject(new Error('Child debuggee ID and/or project ID' +
                             'is not consistent with previous child'));
          }
        }
        numChildrenReady++;
        if (numChildrenReady === CLUSTER_WORKERS) {
          resolve();
        }
      };
      var stdoutHandler = function(chunk) {
        transcript += chunk;
      };
      for (var i = 0; i < CLUSTER_WORKERS; i++) {
        var child = cp.fork('../fixtures/fib.js');
        child.on('message', handler);
        child.stdout.on('data', stdoutHandler);
        child.stderr.on('data', stdoutHandler);
        children.push(child);
      }
    });
  });

  afterEach(function() {
    console.log('child transcript: ', transcript);
    children.forEach(function (child) {
      child.kill();
    });
    debuggeeId = null;
    projectId = null;
    transcript = null;
    children = [];
  });

  it('should set breakpoints correctly', function() {
    var api;
    return delay(0).then(function() {
      // List debuggees

      // (Assign debugger API)
      var callbackApi = new Debugger();
      api = thenifyAll(callbackApi, callbackApi, [
        'listDebuggees',
        'listBreakpoints',
        'getBreakpoint',
        'setBreakpoint',
        'deleteBreakpoint'
      ]);

      return api.listDebuggees(projectId);
    }).then(function(debuggees) {
      // Check that the debuggee created in this test is among the list of
      // debuggees, then list its breakpoints

      console.log('-- List of debuggees\n',
        util.inspect(debuggees, { depth: null}));
      assert.ok(debuggees, 'should get a valid ListDebuggees response');
      var result = _.find(debuggees, function(d) {
        return d.id === debuggeeId;
      });
      assert.ok(result, 'should find the debuggee we just registered');
      return api.listBreakpoints(debuggeeId);
    }).then(function(breakpoints) {
      // Delete every breakpoint

      console.log('-- List of breakpoints\n', breakpoints);

      var promises = breakpoints.map(function(breakpoint) {
        return api.deleteBreakpoint(debuggeeId, breakpoint.id);
      });

      return Promise.all(promises);
    }).then(function(results) {
      // Set a breakpoint at which the debugger should write to a log

      console.log('-- deleted');

      console.log('-- setting a logpoint');
      return api.setBreakpoint(debuggeeId, {
        id: 'breakpoint-1',
        location: {path: FILENAME, line: 5},
        condition: 'n === 10',
        action: 'LOG',
        expressions: ['o'],
        log_message_format: 'o is: $0'
      });
    }).then(function(breakpoint) {
      // Check that the breakpoint was set, and then wait for the log to be
      // written to

      assert.ok(breakpoint, 'should have set a breakpoint');
      assert.ok(breakpoint.id, 'breakpoint should have an id');
      assert.ok(breakpoint.location, 'breakpoint should have a location');
      assert.strictEqual(breakpoint.location.path, FILENAME);

      console.log('-- waiting before checking if the log was written');
      return Promise.all([breakpoint, delay(10 * 1000)]);
    }).then(function(results) {
      // Check the contents of the log, and then delete the breakpoint

      var breakpoint = results[0];

      assert(transcript.indexOf('o is: {"a":[1,"hi",true]}') !== -1);
      return api.deleteBreakpoint(debuggeeId, breakpoint.id);
    }).then(function() {
      // Set another breakpoint at the same location

      console.log('-- setting a breakpoint');
      return api.setBreakpoint(debuggeeId, {
        id: 'breakpoint-1',
        location: {path: FILENAME, line: 5},
        expressions: ['process'], // Process for large variable
        condition: 'n === 10'
      });
    }).then(function(breakpoint) {
      // Check that the breakpoint was set, and then wait for the breakpoint to
      // be hit

      console.log('-- resolution of setBreakpoint', breakpoint);
      assert.ok(breakpoint, 'should have set a breakpoint');
      assert.ok(breakpoint.id, 'breakpoint should have an id');
      assert.ok(breakpoint.location, 'breakpoint should have a location');
      assert.strictEqual(breakpoint.location.path, FILENAME);

      console.log('-- waiting before checking if breakpoint was hit');
      return Promise.all([breakpoint, delay(10 * 1000)]);
    }).then(function(results) {
      // Get the breakpoint

      var breakpoint = results[0];

      console.log('-- now checking if the breakpoint was hit');
      return api.getBreakpoint(debuggeeId, breakpoint.id);
    }).then(function(breakpoint) {
      // Check that the breakpoint was hit and contains the correct information,
      // which ends the test

      var arg;
      console.log('-- results of get breakpoint\n', breakpoint);
      assert.ok(breakpoint, 'should have a breakpoint in the response');
      assert.ok(breakpoint.isFinalState, 'breakpoint should have been hit');
      assert.ok(Array.isArray(breakpoint.stackFrames), 'should have stack ');
      var top = breakpoint.stackFrames[0];
      assert.ok(top, 'should have a top entry');
      assert.ok(top.function, 'frame should have a function property');
      assert.strictEqual(top.function, 'fib');

      if (semver.satisfies(process.version, '>=4.0')) {
        arg = _.find(top.locals, {name: 'n'});
      } else {
        arg = _.find(top.arguments, {name: 'n'});
      }
      assert.ok(arg, 'should find the n argument');
      assert.strictEqual(arg.value, '10');
      console.log('-- checking log point was hit again');
      assert.ok(
        transcript.split('LOGPOINT: o is: {"a":[1,"hi",true]}').length > 4);
      console.log('-- test passed');
      return Promise.resolve();
    });
  });
});
