// Copyright 2015 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as assert from 'assert';
import {before, describe, it} from 'mocha';
import * as nock from 'nock';

import {Debug} from '../src/client/stackdriver/debug';
import {Debuggee} from '../src/debuggee';
import {defaultConfig as DEFAULT_CONFIG} from '../src/agent/config';
import * as stackdriver from '../src/types/stackdriver';
import * as t from 'teeny-request'; // types only
import {teenyRequest} from 'teeny-request';

// the tests in this file rely on the GCLOUD_PROJECT environment variable
// not being set
delete process.env.GCLOUD_PROJECT;

import {OnePlatformController} from '../src/agent/oneplatform-controller';
// TODO: Fix fakeDebug to actually implement Debug.
const fakeDebug = {
  apiEndpoint: 'clouddebugger.googleapis.com',
  request: (options: t.Options, cb: t.RequestCallback) => {
    teenyRequest(options, (err, r) => {
      cb(err, r ? r.body : undefined, r);
    });
  },
} as {} as Debug;

const agentVersion = 'SomeName/client/SomeVersion';
const url = 'https://clouddebugger.googleapis.com';
const api = '/v2/controller';

nock.disableNetConnect();

describe('Controller API', () => {
  describe('register', () => {
    it('should get a debuggeeId', done => {
      const scope = nock(url)
        .post(api + '/debuggees/register')
        .reply(200, {
          debuggee: {id: 'fake-debuggee'},
          activePeriodSec: 600,
        });
      const debuggee = new Debuggee({
        project: 'fake-project',
        uniquifier: 'fake-id',
        description: 'unit test',
        agentVersion,
      });
      const controller = new OnePlatformController(fakeDebug, DEFAULT_CONFIG);
      // TODO: Determine if this type signature is correct.
      controller.register(debuggee, (err, result) => {
        assert(!err, 'not expecting an error');
        assert.ok(result);
        assert.strictEqual(result!.debuggee.id, 'fake-debuggee');
        scope.done();
        done();
      });
    });

    it('should get an agentId', done => {
      const scope = nock(url)
        .post(api + '/debuggees/register')
        .reply(200, {
          debuggee: {id: 'fake-debuggee'},
          agentId: 'fake-agent-id',
          activePeriodSec: 600,
        });
      const debuggee = new Debuggee({
        project: 'fake-project',
        uniquifier: 'fake-id',
        description: 'unit test',
        agentVersion,
      });
      const controller = new OnePlatformController(fakeDebug, DEFAULT_CONFIG);
      // TODO: Determine if this type signature is correct.
      controller.register(debuggee, (err, result) => {
        assert(!err, 'not expecting an error');
        assert.ok(result);
        assert.strictEqual(result!.agentId, 'fake-agent-id');
        scope.done();
        done();
      });
    });

    it('should not return an error when the debuggee isDisabled', done => {
      const scope = nock(url)
        .post(api + '/debuggees/register')
        .reply(200, {
          debuggee: {id: 'fake-debuggee', isDisabled: true},
          activePeriodSec: 600,
        });
      const debuggee = new Debuggee({
        project: 'fake-project',
        uniquifier: 'fake-id',
        description: 'unit test',
        agentVersion,
      });
      const controller = new OnePlatformController(fakeDebug, DEFAULT_CONFIG);
      controller.register(debuggee, (err, result) => {
        // TODO: Fix this incorrect method signature.
        (assert as {ifError: Function}).ifError(err, 'not expecting an error');
        assert.ok(result);
        assert.strictEqual(result!.debuggee.id, 'fake-debuggee');
        assert.ok(result!.debuggee.isDisabled);
        scope.done();
        done();
      });
    });
  });

  describe('listBreakpoints', () => {
    // register before each test
    before(done => {
      nock(url)
        .post(api + '/debuggees/register')
        .reply(200, {
          debuggee: {id: 'fake-debuggee'},
          activePeriodSec: 600,
        });
      const debuggee = new Debuggee({
        project: 'fake-project',
        uniquifier: 'fake-id',
        description: 'unit test',
        agentVersion,
      });
      const controller = new OnePlatformController(fakeDebug, DEFAULT_CONFIG);
      controller.register(debuggee, (err /*, result*/) => {
        assert.ifError(err);
        done();
      });
    });

    it('should deal with a missing breakpoints response', done => {
      const scope = nock(url)
        .get(api + '/debuggees/fake-debuggee/breakpoints?successOnTimeout=true')
        .reply(200, {kind: 'whatever'});

      const debuggee = {id: 'fake-debuggee'};
      const controller = new OnePlatformController(fakeDebug, DEFAULT_CONFIG);
      // TODO: Fix debuggee to actually implement Debuggee
      // TODO: Determine if the response parameter should be used.
      controller.listBreakpoints(
        debuggee as Debuggee,
        (err, response, result?: stackdriver.ListBreakpointsResponse) => {
          assert(!err, 'not expecting an error');
          // TODO: Handle the case where result is undefined
          assert(
            !(result as {breakpoints: {}}).breakpoints,
            'should not have a breakpoints property'
          );
          scope.done();
          done();
        }
      );
    });

    describe('invalid responses', () => {
      const tests: string | Array<{}> = ['', 'JSON, this is not', []];
      tests.forEach((invalidResponse, index) => {
        it('should pass test ' + index, done => {
          const scope = nock(url)
            .get(
              api + '/debuggees/fake-debuggee/breakpoints?successOnTimeout=true'
            )
            .reply(200, invalidResponse);
          const debuggee = {id: 'fake-debuggee'};
          const controller = new OnePlatformController(
            fakeDebug,
            DEFAULT_CONFIG
          );
          // TODO: Fix debuggee to actually implement Debuggee
          // TODO: Determine if the response parameter should be used.
          controller.listBreakpoints(
            debuggee as Debuggee,
            (err, response, result?: stackdriver.ListBreakpointsResponse) => {
              assert(!err, 'not expecting an error');
              // TODO: Handle the case where result is undefined
              assert(
                !(result as {breakpoints: {}}).breakpoints,
                'should not have breakpoints property'
              );
              scope.done();
              done();
            }
          );
        });
      });
    });

    it('should throw error on http errors', done => {
      const scope = nock(url)
        .get(api + '/debuggees/fake-debuggee/breakpoints?successOnTimeout=true')
        .reply(403);
      // TODO: Fix debuggee to actually implement Debuggee
      const debuggee: Debuggee = {id: 'fake-debuggee'} as Debuggee;
      const controller = new OnePlatformController(fakeDebug, DEFAULT_CONFIG);
      // TODO: Determine if the response parameter should be used.
      controller.listBreakpoints(debuggee, (err, response, result) => {
        assert(err instanceof Error, 'expecting an error');
        assert(!result, 'should not have a result');
        scope.done();
        done();
      });
    });

    it('should work with waitTokens', done => {
      const scope = nock(url)
        .get(api + '/debuggees/fake-debuggee/breakpoints?successOnTimeout=true')
        .reply(200, {waitExpired: true});
      // TODO: Fix debuggee to actually implement Debuggee
      const debuggee: Debuggee = {id: 'fake-debuggee'} as Debuggee;
      const controller = new OnePlatformController(fakeDebug, DEFAULT_CONFIG);
      // TODO: Determine if the result parameter should be used.
      controller.listBreakpoints(debuggee, (err, response) => {
        // TODO: Fix this incorrect method signature.
        (assert as {ifError: Function}).ifError(err, 'not expecting an error');
        // TODO: Fix this error that states `body` is not a property
        //       of `ServerResponse`.
        assert(
          (response as {} as {body: {waitExpired: {}}}).body.waitExpired,
          'should have expired set'
        );
        scope.done();
        done();
      });
    });

    it('should work with agentId provided from registration', done => {
      const scope = nock(url)
        .post(api + '/debuggees/register')
        .reply(200, {
          debuggee: {id: 'fake-debuggee'},
          agentId: 'fake-agent-id',
          activePeriodSec: 600,
        })
        .get(
          api +
            '/debuggees/fake-debuggee/breakpoints?successOnTimeout=true&agentId=fake-agent-id'
        )
        .reply(200, {waitExpired: true});
      const debuggee = new Debuggee({
        project: 'fake-project',
        uniquifier: 'fake-id',
        description: 'unit test',
        agentVersion,
      });
      const controller = new OnePlatformController(fakeDebug, DEFAULT_CONFIG);
      controller.register(debuggee, (err1 /*, response1*/) => {
        assert.ifError(err1);
        const debuggeeWithId: Debuggee = {id: 'fake-debuggee'} as Debuggee;
        // TODO: Determine if the result parameter should be used.
        controller.listBreakpoints(debuggeeWithId, (err2 /*, response2*/) => {
          assert.ifError(err2);
          scope.done();
          done();
        });
      });
    });

    // TODO: Fix this so that each element of the array is actually an
    //       array of Breakpoints.
    const testsBreakpoints: stackdriver.Breakpoint[][] = [
      [],
      [{id: 'breakpoint-0', location: {path: 'foo.js', line: 18}}],
    ] as stackdriver.Breakpoint[][];
    testsBreakpoints.forEach(
      (breakpoints: stackdriver.Breakpoint[], index: number) => {
        it('should pass test ' + index, done => {
          const scope = nock(url)
            .get(
              api + '/debuggees/fake-debuggee/breakpoints?successOnTimeout=true'
            )
            .reply(200, {breakpoints});
          // TODO: Fix debuggee to actually implement Debuggee
          const debuggee: Debuggee = {id: 'fake-debuggee'} as Debuggee;
          const controller = new OnePlatformController(
            fakeDebug,
            DEFAULT_CONFIG
          );
          // TODO: Determine if the response parameter should be used.
          controller.listBreakpoints(debuggee, (err, response, result) => {
            assert(!err, 'not expecting an error');
            assert.ok(result);
            assert(result!.breakpoints, 'should have a breakpoints property');
            const bps = result!.breakpoints;
            assert.deepStrictEqual(bps, breakpoints, 'breakpoints mismatch');
            scope.done();
            done();
          });
        });
      }
    );
  });

  describe('updateBreakpoint', () => {
    it('should PUT to server when a breakpoint is updated', done => {
      // TODO: Fix breakpoint to actually Breakpoint
      const breakpoint: stackdriver.Breakpoint = {
        id: 'breakpoint-0',
        location: {path: 'foo.js', line: 99},
      } as stackdriver.Breakpoint;
      // A cast for the second argument to put() is necessary for nock 11
      // because the type definitions state that the second argument cannot
      // be an Object even though the nock code itself seems to handle an
      // Object.  Further, the tests pass when using the cast.
      // This issue is being tracked in the nock repo at
      // https://github.com/nock/nock/issues/1731.
      const scope = nock(url)
        .put(api + '/debuggees/fake-debuggee/breakpoints/breakpoint-0', {
          debuggeeId: 'fake-debuggee',
          breakpoint,
        } as {})
        .reply(200, {
          kind: 'debugletcontroller#updateActiveBreakpointResponse',
        });
      // TODO: Fix debuggee to actually implement Debuggee
      const debuggee: Debuggee = {id: 'fake-debuggee'} as Debuggee;
      const controller = new OnePlatformController(fakeDebug, DEFAULT_CONFIG);
      controller.updateBreakpoint(
        debuggee as Debuggee,
        breakpoint,
        (err, result) => {
          assert(!err, 'not expecting an error');
          assert.strictEqual(
            (result as {kind: {}}).kind,
            'debugletcontroller#updateActiveBreakpointResponse'
          );
          scope.done();
          done();
        }
      );
    });
  });
});
