/**
 * Copyright 2016 Google Inc. All Rights Reserved.
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
var Logger = require('@google/cloud-diagnostics-common').logger;
var logger = Logger.create();

assert.ok(
    process.env.GCLOUD_PROJECT,
    'Need to have GCLOUD_PROJECT defined ' +
        'along with valid application default credentials to be able to run this ' +
        'test');
var config = {};

var debug = require('../')(config);
var DebugletApi = require('../src/controller.js');

describe('Debugletapi', function() {

  it('should register successfully', function(done) {
    var debugletApi = new DebugletApi({}, debug);
    debugletApi.init('test-uid-1', logger, function(err) {
      assert.ifError(err, 'init should complete successfully');

      debugletApi.register(function(err, body) {
        assert.ifError(err, 'should be able to register successfull');
        assert.ok(body);
        assert.ok(body.debuggee);
        assert.ok(body.debuggee.id);
        done();
      });
    });
  });

  it('should list breakpoints', function(done) {
    var debugletApi = new DebugletApi({}, debug);
    debugletApi.init('test-uid-2', logger, function(err) {
      assert.ifError(err, 'init should complete successfully');

      debugletApi.register(function(err, body) {
        assert.ifError(err, 'should be able to register successfull');

        debugletApi.listBreakpoints(function(err, response, body) {
          assert.ifError(err, 'should successfully list breakpoints');
          assert.ok(body);
          assert.ok(body.nextWaitToken);
          done();
        });
      });
    });
  });

  // To be able to write the following test we need a service for adding a
  // breakpoint (need the debugger API). TODO.
  it('should update an active breakpoint');

});
