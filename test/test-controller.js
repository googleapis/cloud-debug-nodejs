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
'use strict';

var assert = require('assert');
var nock   = require('nock');
var request = require('./auth-request.js');
var proxyquire = require('proxyquire');

// the tests in this file rely on the GCLOUD_PROJECT environment variable
// not being set
delete process.env.GCLOUD_PROJECT;

// require DebugletAPI while stubbing auth to bypass authentication
//
var utils = {
  getProjectNumber: function(callback) { callback(null, 'project123'); }
};
var DebugletApi = proxyquire('../src/controller.js', {
  '@google/cloud-diagnostics-common': {
    logger: null,
    utils: utils
  }
});
var fakeDebug = {
  request: request
};

var url = 'https://clouddebugger.googleapis.com';
var api = '/v2/controller';

nock.disableNetConnect();

describe('Debuglet API', function() {

  var debugletapi = new DebugletApi({
    description: 'Test debuglet',
    serviceContext: {
      service: 'TestDebugletName',
      version: 'TestDebugletVersion'
    }
  }, fakeDebug); // use vanilla request to bypass authentication

  it('should return an instance when constructed', function() {
    assert.ok(debugletapi);
  });

  it('should have correct descriptor', function() {
    assert.equal(debugletapi.descriptor_, 'Test debuglet');
  });

  it('should have correct service name', function() {
    assert.equal(debugletapi.serviceName_, 'TestDebugletName');
  });

  it('should have correct service version', function() {
    assert.equal(debugletapi.serviceVersion_, 'TestDebugletVersion');
  });

  it('should acquire the project number during init', function(done) {
    debugletapi.init('uid123', { warn: function() {} }, function(err, project) {
      assert(!err);
      // make sure init() invokes the callback with the correct project name
      assert.equal(project, 'project123');
      // make sure the debugletapi is properly storing the project name
      assert.equal(debugletapi.project_, project);
      done();
    });
  });

  describe('register', function() {
    it('should get a debuggeeId', function(done) {
      var scope = nock(url)
        .post(api + '/debuggees/register', function (body) {
          return body.debuggee.agentVersion.indexOf('node-gcp') !== -1;
        })
        .reply(200, {
          debuggee: { id: 'fake-debuggee' },
          activePeriodSec: 600
        });
      debugletapi.register(function(err, result) {
        assert(!err, 'not expecting an error');
        assert.equal(result.debuggee.id, 'fake-debuggee');
        assert.equal(debugletapi.debuggeeId_, 'fake-debuggee');
        scope.done();
        done();
      });
    });

    it('should have correct version without projectId', function(done) {
      var oldProjNum = utils.getProjectNumber;
      utils.getProjectNumber = function(callback) {
        callback(new Error(), null);
      };
      process.env.GCLOUD_PROJECT = 'project123';
      var debugletapi = new DebugletApi(null, fakeDebug);
      debugletapi.init('uid1234', { warn: function() {} }, function(err, project) {
        var scope = nock(url)
          .post(api + '/debuggees/register', function (body) {
            return body.debuggee.agentVersion.indexOf('standalone') !== -1;
          })
          .reply(200, {
            debuggee: { id: 'fake-debuggee' },
            activePeriodSec: 600
          });
        debugletapi.register(function(err, result) {
          assert(!err, 'not expecting an error');
          assert.equal(result.debuggee.id, 'fake-debuggee');
          assert.equal(debugletapi.debuggeeId_, 'fake-debuggee');
          scope.done();
          delete process.env.GCLOUD_PROJECT;
          utils.getProjectNumber = oldProjNum;
          done();
        });
      });
    });

    it('should return error when debuggee is disabled', function(done) {
      var scope = nock(url)
                    .post(api + '/debuggees/register')
                    .reply(200, {
                      debuggee: {
                        id: 'fake-debuggee',
                        isDisabled: true
                      },
                      activePeriodSec: 600,
                    });
      debugletapi.register(function(err/*, result*/) {
        assert(err, 'expected an error');
        scope.done();
        done();
      });
    });

  });

  describe('listBreakpoints', function() {

    // register before each test
    before(function(done) {
      nock(url)
        .post(api + '/debuggees/register')
        .reply(200, {
          debuggee: { id: 'fake-debuggee' },
          activePeriodSec: 600
        });
      debugletapi.register(function(err/*, result*/) {
        assert.ifError(err);
        done();
      });
    });

    it('should deal with a missing breakpoints response', function(done) {
      var scope = nock(url)
        .get(api + '/debuggees/fake-debuggee/breakpoints?success_on_timeout=true')
        .reply(200, { kind: 'whatever' });

      debugletapi.listBreakpoints(function(err, response, result) {
        assert(!err, 'not expecting an error');
        assert(!result.breakpoints, 'should not have a breakpoints property');
        scope.done();
        done();
      });
    });

    describe('invalid responses', function() {
      var tests = [ '', 'JSON, this is not', []];
      tests.forEach(function(invalidResponse, index) {
        it('should pass test ' + index, function(done) {
          var scope = nock(url)
            .get(api + '/debuggees/fake-debuggee/breakpoints?success_on_timeout=true')
            .reply(200, invalidResponse);
          debugletapi.listBreakpoints(function(err, response, result) {
            assert(!err, 'not expecting an error');
            assert(!result.breakpoints, 'should not have breakpoints property');
            scope.done();
            done();
          });
        });
      });
    });

    it('should throw error on http errors', function(done) {
      var scope = nock(url)
        .get(api + '/debuggees/fake-debuggee/breakpoints?success_on_timeout=true')
        .reply(403);
      debugletapi.listBreakpoints(function(err, response, result) {
        assert(err instanceof Error, 'expecting an error');
        assert(!result, 'should not have a result');
        scope.done();
        done();
      });
    });

    it('should work with waitTokens', function(done) {
      var scope = nock(url)
        .get(api + '/debuggees/fake-debuggee/breakpoints?success_on_timeout=true')
        .reply(200, {
          wait_expired: true
        });

      debugletapi.listBreakpoints(function(err, response, result) {
        assert.ifError(err, 'not expecting an error');
        assert(response.body.wait_expired, 'should have expired set');
        scope.done();
        done();
      });
    });

    var testsBreakpoints = [
      [],
      [{id: 'breakpoint-0',
       location: { path: 'foo.js', line: 18 }}]
    ];
    testsBreakpoints.forEach(function(breakpoints, index) {
      it('should pass test ' + index, function(done) {
        var scope = nock(url)
          .get(api + '/debuggees/fake-debuggee/breakpoints?success_on_timeout=true')
          .reply(200, {
            breakpoints: breakpoints
          });

        debugletapi.listBreakpoints(function(err, response, result) {
          assert(!err, 'not expecting an error');
          assert(result.breakpoints, 'should have a breakpoints property');
          var bps = result.breakpoints;
          assert.deepEqual(bps, breakpoints, 'breakpoints mismatch');
          scope.done();
          done();
        });
      });
    });
  });

  describe('updateBreakpoint', function() {
    it('should PUT to server when a breakpoint is updated', function(done) {
      var breakpoint = {id: 'breakpoint-0', location: {path: 'foo.js', line: 99}};
      var scope = nock(url)
        .put(api + '/debuggees/fake-debuggee/breakpoints/breakpoint-0', {
          debuggeeId: 'fake-debuggee',
          breakpoint: breakpoint
          })
        .reply(200, { kind: 'debugletcontroller#updateActiveBreakpointResponse'});
      debugletapi.updateBreakpoint(breakpoint,
        function(err, result) {
          assert(!err, 'not expecting an error');
          assert.equal(result.kind, 'debugletcontroller#updateActiveBreakpointResponse');
          scope.done();
          done();
        });
    });
  });



});
