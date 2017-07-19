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

import * as assert from 'assert';

assert.ok(
    process.env.GCLOUD_PROJECT,
    'Need to have GCLOUD_PROJECT defined to be able to run this test');
assert.ok(
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    'Need to have GOOGLE_APPLICATION_CREDENTIALS defined to be able to run ' +
    'this test');

import {Controller} from '../src/controller';
import {Debuggee} from '../src/debuggee';
import {Debug} from '../src/debug';
// TODO: Determine if Debug should be updated so that its only parameter is
//       optional.
const debug = new Debug({});


describe('Controller', function() {
  this.timeout(60 * 1000);

  it('should register successfully', function(done) {
    const controller = new Controller(debug);
    const debuggee =
        new Debuggee({
          project: process.env.GCLOUD_PROJECT,
          uniquifier: 'test-uid-' + Date.now(),
          description: 'this is a system test',
          // TODO: Determine if statusMessage should be made optional.
          statusMessage: null
        });

    controller.register(debuggee, function(err, body) {
      // TODO: Only 1 parameter is expected.  Fix this.
      (assert as any).ifError(err, 'should be able to register successfully');
      assert.ok(body);
      assert.ok(body.debuggee);
      assert.ok(body.debuggee.id);
      done();
    });
  });

  it('should list breakpoints', function(done) {
    const controller = new Controller(debug);
    const debuggee =
        new Debuggee({
          project: process.env.GCLOUD_PROJECT,
          uniquifier: 'test-uid-' + Date.now(),
          description: 'this is a system test',
          // TODO: Determine if statusMessage should be made optional.
          statusMessage: null
        });
    // TODO: Determine if the body parameter should be used.
    controller.register(debuggee, function(err, _body) {
      // TODO: Only 1 parameter is expected.  Fix this.
      (assert as any).ifError(err, 'should be able to register successfully');

      // TODO: Determine if the response parameter should be used.
      controller.listBreakpoints(debuggee, function(err, _response, body) {
        // TODO: Only 1 parameter is expected.  Fix this.
        (assert as any).ifError(err, 'should successfully list breakpoints');
        assert.ok(body);
        assert.ok(body.nextWaitToken);
        done();
      });
    });
  });

  it('should pass success on timeout', function(done) {
    this.timeout(100000);
    const controller = new Controller(debug);
    const debuggee =
        new Debuggee({
          project: process.env.GCLOUD_PROJECT,
          uniquifier: 'test-uid-' + Date.now(),
          description: 'this is a system test',
          // TODO: Determine if statusMessage should be made optional.
          statusMessage: null
        });
    // TODO: Determine if the body parameter should be used.
    controller.register(debuggee, function(err, _body) {
      // TODO: Only 1 parameter is expected.  Fix this.
      (assert as any).ifError(err, 'should be able to register successfully');

      // First list should set the wait token
      // TODO: Determine if the response parameter should be used.
      controller.listBreakpoints(debuggee, function(err, _response, body) {
        // TODO: Only 1 parameter is expected.  Fix this.
        (assert as any).ifError(err, 'should successfully list breakpoints');
        assert.ok(body);
        assert.ok(body.nextWaitToken);
        // Second list should block until the wait timeout
        // TODO: Determine if the response parameter should be used.
        controller.listBreakpoints(debuggee, function(err, _response, body) {
          // TODO: Only 1 parameter is expected.  Fix this.
          (assert as any).ifError(err, 'should successfully list breakpoints');
          assert.ok(body);
          assert.ok(body.nextWaitToken);
          // waitExpired will only be set if successOnTimeout was given correctly
          assert.ok(body.waitExpired);
          done();
        });
      });
    });
  });

  // To be able to write the following test we need a service for adding a
  // breakpoint (need the debugger API). TODO.
  it('should update an active breakpoint');

});
