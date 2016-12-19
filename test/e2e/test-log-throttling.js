/* KEEP THIS CODE AT THE TOP SO THAT THE BREAKPOINT LINE NUMBERS DON'T CHANGE */
'use strict';
function fib(n) {
  if (n < 2) { return n; } var o = { a: [1, 'hi', true] };
  return fib(n - 1, o) + fib(n - 2, o); // adding o to appease linter.
}
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
var cluster = require('cluster');
var extend = require('extend');

var DEBUG_API = 'https://clouddebugger.googleapis.com/v2/debugger';
var SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/cloud_debugger',
  ];

var globalDebuggee;
var globalProject;
var transcript = '';

var FILENAME = 'test-log-throttling.js';

function apiRequest(authClient, url, method, body) {
  method = method || 'GET';

  return new Promise(function (resolve, reject) {
    authClient.request({
      url: url,
      method: method,
      json: true,
      body: body
    }, function(err, body, response) {
      if (err) {
        reject(err);
      } else {
        resolve(body);
      }
    });
  });
}

var delay = function(delayTimeMS) {
  return new Promise(function(resolve, reject) {
    setTimeout(resolve, delayTimeMS);
  });
};

function runTest() {
  return delay(10 * 1000).then(function() {
    return new Promise(function(resolve, reject) {
      // Get our own credentials because we need an extra scope
      var auth = new GoogleAuth();
      auth.getApplicationDefault(function(err, authClient) {
        if (err) {
          reject(err);
        }
        resolve(authClient);
      });
    });
  }).then(function(authClient) {
    // List debuggees

    // (Inject scopes if they have not been injected by the environment)
    if (authClient.createScopedRequired &&
        authClient.createScopedRequired()) {
      authClient = authClient.createScoped(SCOPES);
    }

    // (Define API endpoints)
    var api = {
      listDebuggees: function(project) {
        return apiRequest(authClient, DEBUG_API + '/debuggees?project=' +
          project);
      },
      listBreakpoints: function(debuggee) {
        return apiRequest(authClient, DEBUG_API + '/debuggees/' + debuggee +
          '/breakpoints');
      },
      deleteBreakpoint: function(debuggee, breakpoint) {
        return apiRequest(authClient, DEBUG_API + '/debuggees/' + debuggee +
          '/breakpoints/' + breakpoint.id, 'DELETE');
      },
      setBreakpoint: function(debuggee, body) {
        return apiRequest(authClient, DEBUG_API + '/debuggees/' + debuggee +
          '/breakpoints/set', 'POST', body);
      },
      getBreakpoint: function(debuggee, breakpoint) {
        return apiRequest(authClient, DEBUG_API + '/debuggees/' + debuggee +
          '/breakpoints/' + breakpoint.id);
      }
    };

    return Promise.all([api, api.listDebuggees(globalProject)]);
  }).then(function(results) {
    // Check that the debuggee created in this test is among the list of
    // debuggees, then list its breakpoints

    var api = results[0];
    var body = results[1];

    console.log('-- List of debuggees\n',
      util.inspect(body, { depth: null}));
    assert.ok(body, 'should get a valid ListDebuggees response');
    assert.ok(body.debuggees, 'should have a debuggees property');
    var result = _.find(body.debuggees, function(d) {
      return d.id === globalDebuggee;
    });
    assert.ok(result, 'should find the debuggee we just registered');

    return Promise.all([api, api.listBreakpoints(globalDebuggee)]);
  }).then(function(results) {
    // Delete every breakpoint

    var api = results[0];
    var body = results[1];

    console.log('-- List of breakpoints\n', body);
    body.breakpoints = body.breakpoints || [];

    var promises = body.breakpoints.map(function(breakpoint) {
      return api.deleteBreakpoint(globalDebuggee, breakpoint);
    });

    return Promise.all([api, Promise.all(promises)]);
  }).then(function(results) {
    // Set a breakpoint at which the debugger should write to a log

    var api = results[0];
    var deleteResults = results[1];

    console.log('-- delete results', deleteResults);

    console.log('-- setting a logpoint');
    var promise = api.setBreakpoint(globalDebuggee, {
      id: 'breakpoint-1',
      location: {path: FILENAME, line: 5},
      condition: 'n === 10',
      action: 'LOG',
      expressions: ['o'],
      log_message_format: 'o is: $0'
    });
    return Promise.all([api, promise]);
  }).then(function(results) {
    // Check that the breakpoint was set, and then wait for the log to be
    // written to

    var api = results[0];
    var body = results[1];

    console.log('-- resolution of setBreakpoint', body);
    assert.ok(body.breakpoint, 'should have set a breakpoint');
    var breakpoint = body.breakpoint;
    assert.ok(breakpoint.id, 'breakpoint should have an id');
    assert.ok(breakpoint.location, 'breakpoint should have a location');
    assert.strictEqual(breakpoint.location.path, FILENAME);

    console.log('-- waiting before checking if the log was written');
    return Promise.all([api, breakpoint, delay(10 * 1000)]);
  }).then(function(results) {
    // Check that the contents of the log is correct

    var api = results[0];
    var breakpoint = results[1];

    // If no throttling occurs, we expect ~20 logs since we are logging
    // 2x per second over a 10 second period.
    var logCount =
      transcript.split('LOGPOINT: o is: {"a":[1,"hi",true]}').length - 1;
    // A log count of greater than 10 indicates that we did not successfully
    // pause when the rate of `maxLogsPerSecond` was reached.
    assert(logCount < 10);
    // A log count of less than 3 indicates that we did not successfully
    // resume logging after `logDelaySeconds` have passed.
    assert(logCount > 2);

    return api.deleteBreakpoint(globalDebuggee, breakpoint);
  }).then(function() {
    console.log('Test passed');
    process.exit(0);
  })
  .catch(function(e) {
    console.error(e);
    process.exit(1);
  });
}

if (cluster.isMaster) {
  cluster.setupMaster({ silent: true });
  var handler = function(a) {
    // Cache the needed info from the first worker.
    if (!globalDebuggee) {
      globalDebuggee = a[0];
      globalProject = a[1];
    }
  };
  var stdoutHandler = function(chunk) {
    transcript += chunk;
  };
  var worker = cluster.fork();
  worker.on('message', handler);
  worker.process.stdout.on('data', stdoutHandler);
  worker.process.stderr.on('data', stdoutHandler);
  process.on('exit', function() {
    console.log('child transcript: ', transcript);
  });
  // Run the test
  runTest().then(function () {
    process.exit(0);
  }).catch(function (e) {
    console.error(e);
    process.exit(1);
  });
} else {
  var debug = require('../..')();
  var defaultConfig = require('../../src/config.js');
  var config = extend({}, defaultConfig, {
    log: {
      maxLogsPerSecond: 2,
      logDelaySeconds: 5
    }
  });
  debug.startAgent(config);
  setTimeout(function() {
    assert.ok(debug.private_, 'debuglet has initialized');
    var debuglet = debug.private_;
    var debuggee = debuglet.debuggee_;
    assert.ok(debuggee, 'should create debuggee');
    assert.ok(debuggee.project, 'debuggee should have a project');
    assert.ok(debuggee.id, 'debuggee should have registered');
    // The parent process needs to know the debuggeeId and project.
    process.send([debuggee.id, debuggee.project]);
    setInterval(fib.bind(null, 12), 500);
  }, 7000);
}
