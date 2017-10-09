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
import * as http from 'http';

import * as assert from 'assert';
import * as nock from 'nock';
import request from './auth-request';
import {Debuggee} from '../src/debuggee';
import {Debug} from '../src/debug';

// the tests in this file rely on the GCLOUD_PROJECT environment variable
// not being set
delete process.env.GCLOUD_PROJECT;

import {Controller} from '../src/agent/controller';
// TODO: Fix fakeDebug to actually implement Debug.
const fakeDebug: Debug = {
  request: request
} as any as Debug;

const url = 'https://clouddebugger.googleapis.com';
const api = '/v2/controller';

nock.disableNetConnect();

describe('Controller API', function() {

  describe('register', function() {
    it('should get a debuggeeId', function(done) {
      const scope =
          nock(url)
              .post(api + '/debuggees/register')
              .reply(200,
                     {debuggee: {id: 'fake-debuggee'}, activePeriodSec: 600});
      const debuggee = new Debuggee({
        project: 'fake-project',
        uniquifier: 'fake-id',
        description: 'unit test'
      });
      const controller = new Controller(fakeDebug);
      // TODO: Determine if this type signature is correct.
      controller.register(debuggee, function(err: Error|null, result: { debuggee: Debuggee }) {
        assert(!err, 'not expecting an error');
        assert.equal(result.debuggee.id, 'fake-debuggee');
        scope.done();
        done();
      });
    });

    it('should not return an error when the debuggee isDisabled',
       function(done) {
         const scope = nock(url)
                         .post(api + '/debuggees/register')
                         .reply(200, {
                           debuggee: {id: 'fake-debuggee', isDisabled: true},
                           activePeriodSec: 600,
                         });
         const debuggee = new Debuggee({
           project: 'fake-project',
           uniquifier: 'fake-id',
           description: 'unit test'
         });
         const controller = new Controller(fakeDebug);
         controller.register(debuggee, function(err: Error, result: {debuggee: Debuggee}) {
           // TODO: Fix this incorrect method signature.
           (assert as any).ifError(err, 'not expecting an error');
           assert.equal(result.debuggee.id, 'fake-debuggee');
           assert.ok(result.debuggee.isDisabled);
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
      const debuggee = new Debuggee({
        project: 'fake-project',
        uniquifier: 'fake-id',
        description: 'unit test'
      });
      const controller = new Controller(fakeDebug);
      controller.register(debuggee, function(err/*, result*/) {
        assert.ifError(err);
        done();
      });
    });

    it('should deal with a missing breakpoints response', function(done) {
      const scope = nock(url)
        .get(api + '/debuggees/fake-debuggee/breakpoints?successOnTimeout=true')
        .reply(200, { kind: 'whatever' });

      const debuggee = { id: 'fake-debuggee' };
      const controller = new Controller(fakeDebug);
      // TODO: Fix debuggee to actually implement Debuggee
      // TODO: Determine if the response parameter should be used.
      controller.listBreakpoints(debuggee as Debuggee, function(err: Error|null, _response?: http.ServerResponse, result?: apiTypes.ListBreakpointsResponse) {
        assert(!err, 'not expecting an error');
        // TODO: Handle the case where result is undefined
        assert(!(result as any).breakpoints, 'should not have a breakpoints property');
        scope.done();
        done();
      });
    });

    describe('invalid responses', function() {
      const tests: string| Array<any> = [ '', 'JSON, this is not', []];
      tests.forEach(function(invalidResponse, index) {
        it('should pass test ' + index, function(done) {
          const scope = nock(url)
            .get(api + '/debuggees/fake-debuggee/breakpoints?successOnTimeout=true')
            .reply(200, invalidResponse);
          const debuggee = { id: 'fake-debuggee' };
          const controller = new Controller(fakeDebug);
          // TODO: Fix debuggee to actually implement Debuggee
          // TODO: Determine if the response parameter should be used.
          controller.listBreakpoints(debuggee as Debuggee, function(err: Error|null, _response?: http.ServerResponse, result?: apiTypes.ListBreakpointsResponse) {
            assert(!err, 'not expecting an error');
            // TODO: Handle the case where result is undefined
            assert(!(result as any).breakpoints, 'should not have breakpoints property');
            scope.done();
            done();
          });
        });
      });
    });

    it('should throw error on http errors', function(done) {
      const scope = nock(url)
        .get(api + '/debuggees/fake-debuggee/breakpoints?successOnTimeout=true')
        .reply(403);
      // TODO: Fix debuggee to actually implement Debuggee
      const debuggee: Debuggee = { id: 'fake-debuggee' } as Debuggee;
      const controller = new Controller(fakeDebug);
      // TODO: Determine if the response parameter should be used.
      controller.listBreakpoints(debuggee, function(err, _response, result) {
        assert(err instanceof Error, 'expecting an error');
        assert(!result, 'should not have a result');
        scope.done();
        done();
      });
    });

    it('should work with waitTokens', function(done) {
      const scope = nock(url)
        .get(api + '/debuggees/fake-debuggee/breakpoints?successOnTimeout=true')
        .reply(200, {
          waitExpired: true
        });
      // TODO: Fix debuggee to actually implement Debuggee
      const debuggee: Debuggee = { id: 'fake-debuggee' } as Debuggee;
      const controller = new Controller(fakeDebug);
      // TODO: Determine if the result parameter should be used.
      controller.listBreakpoints(debuggee, function(err, response, _result) {
        // TODO: Fix this incorrect method signature.
        (assert as any).ifError(err, 'not expecting an error');
        // TODO: Fix this error that states `body` is not a property
        //       of `ServerResponse`.
        assert((response as any).body.waitExpired, 'should have expired set');
        scope.done();
        done();
      });
    });

    // TODO: Fix this so that each element of the array is actually an
    //       array of Breakpoints.
    const testsBreakpoints: apiTypes.Breakpoint[][] = [
      [],
      [{id: 'breakpoint-0',
       location: { path: 'foo.js', line: 18 }}]
    ] as apiTypes.Breakpoint[][];
    testsBreakpoints.forEach(function(breakpoints: apiTypes.Breakpoint[], index: number) {
      it('should pass test ' + index, function(done) {
        const scope = nock(url)
          .get(api + '/debuggees/fake-debuggee/breakpoints?successOnTimeout=true')
          .reply(200, {
            breakpoints: breakpoints
          });
        // TODO: Fix debuggee to actually implement Debuggee
        const debuggee: Debuggee = { id: 'fake-debuggee' } as Debuggee;
        const controller = new Controller(fakeDebug);
        // TODO: Determine if the response parameter should be used.
        controller.listBreakpoints(debuggee, function(err: Error|null, _response: http.ServerResponse, result: apiTypes.ListBreakpointsResponse) {
          assert(!err, 'not expecting an error');
          assert(result.breakpoints, 'should have a breakpoints property');
          const bps = result.breakpoints;
          assert.deepEqual(bps, breakpoints, 'breakpoints mismatch');
          scope.done();
          done();
        });
      });
    });
  });

  describe('updateBreakpoint', function() {
    it('should PUT to server when a breakpoint is updated', function(done) {
      // TODO: Fix breakpoint to actually Breakpoint
      const breakpoint: apiTypes.Breakpoint = {id: 'breakpoint-0', location: {path: 'foo.js', line: 99}} as apiTypes.Breakpoint;
      const scope = nock(url)
        .put(api + '/debuggees/fake-debuggee/breakpoints/breakpoint-0', {
          debuggeeId: 'fake-debuggee',
          breakpoint: breakpoint
          })
        .reply(200, { kind: 'debugletcontroller#updateActiveBreakpointResponse'});
      // TODO: Fix debuggee to actually implement Debuggee
      const debuggee: Debuggee = { id: 'fake-debuggee' } as Debuggee;
      const controller = new Controller(fakeDebug);
      controller.updateBreakpoint(debuggee as Debuggee, breakpoint,
        function(err, result) {
          assert(!err, 'not expecting an error');
          assert.equal(result.kind, 'debugletcontroller#updateActiveBreakpointResponse');
          scope.done();
          done();
        });
    });
  });



});
