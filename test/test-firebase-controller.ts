// Copyright 2022 Google LLC
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

// import * as assert from 'assert';
// import {before, describe, it} from 'mocha';
// import * as nock from 'nock';

// import {Debuggee} from '../src/debuggee';
// import * as stackdriver from '../src/types/stackdriver';
// import * as firebase from 'firebase-admin';

// // the tests in this file rely on the GCLOUD_PROJECT environment variable
// // not being set
// delete process.env.GCLOUD_PROJECT;

// import {FirebaseController} from '../src/agent/firebasecontroller';
// import {promisify} from 'util';
// import {
//   DataSnapshot,
//   EventType,
//   OnDisconnect,
//   Query,
//   Reference,
//   ThenableReference,
// } from '@firebase/database-types';

// const agentVersion = 'SomeName/client/SomeVersion';
// const url = 'https://unittesting-cdbg.firebaseio.com';
// const api = '/cdbg';

// const keyPath = 'someKeyPath';

// nock.disableNetConnect();

// class MockReference implements firebase.database.Reference {
//   constructor() {
//     this.key = '';
//     this.parent = null;
//     this.root = this;
//     this.ref = this;
//   }
//   child(path: string): Reference {
//     throw new Error('Method not implemented.');
//   }
//   key: string | null;
//   onDisconnect(): OnDisconnect {
//     throw new Error('Method not implemented.');
//   }
//   parent: Reference | null;
//   push(value?: any, onComplete?: (a: Error | null) => any): ThenableReference {
//     throw new Error('Method not implemented.');
//   }
//   remove(onComplete?: (a: Error | null) => any): Promise<any> {
//     throw new Error('Method not implemented.');
//   }
//   root: Reference;
//   set(value: any, onComplete?: (a: Error | null) => any): Promise<any> {
//     throw new Error('Method not implemented.');
//   }
//   setPriority(
//     priority: string | number | null,
//     onComplete: (a: Error | null) => any
//   ): Promise<any> {
//     throw new Error('Method not implemented.');
//   }
//   setWithPriority(
//     newVal: any,
//     newPriority: string | number | null,
//     onComplete?: (a: Error | null) => any
//   ): Promise<any> {
//     throw new Error('Method not implemented.');
//   }
//   transaction(
//     transactionUpdate: (a: any) => any,
//     onComplete?: (a: Error | null, b: boolean, c: DataSnapshot | null) => any,
//     applyLocally?: boolean
//   ): Promise<any> {
//     throw new Error('Method not implemented.');
//   }
//   update(
//     values: Record<string, any>,
//     onComplete?: (a: Error | null) => any
//   ): Promise<any> {
//     throw new Error('Method not implemented.');
//   }
//   endBefore(value: string | number | boolean | null, key?: string): Query {
//     throw new Error('Method not implemented.');
//   }
//   endAt(value: string | number | boolean | null, key?: string): Query {
//     throw new Error('Method not implemented.');
//   }
//   equalTo(value: string | number | boolean | null, key?: string): Query {
//     throw new Error('Method not implemented.');
//   }
//   isEqual(other: Query | null): boolean {
//     throw new Error('Method not implemented.');
//   }
//   limitToFirst(limit: number): Query {
//     throw new Error('Method not implemented.');
//   }
//   limitToLast(limit: number): Query {
//     throw new Error('Method not implemented.');
//   }
//   off(
//     eventType?: EventType,
//     callback?: (a: DataSnapshot, b?: string | null) => any,
//     context?: Record<string, any> | null
//   ): void {
//     throw new Error('Method not implemented.');
//   }
//   get(): Promise<DataSnapshot> {
//     throw new Error('Method not implemented.');
//   }
//   on(
//     eventType: EventType,
//     callback: (a: DataSnapshot, b?: string | null) => any,
//     cancelCallbackOrContext?: Record<string, any> | ((a: Error) => any) | null,
//     context?: Record<string, any> | null
//   ): (a: DataSnapshot | null, b?: string | null) => any {
//     throw new Error('Method not implemented.');
//   }
//   once(
//     eventType: EventType,
//     successCallback?: (a: DataSnapshot, b?: string | null) => any,
//     failureCallbackOrContext?:
//       | Record<string, any>
//       | ((a: Error) => void)
//       | null,
//     context?: Record<string, any> | null
//   ): Promise<DataSnapshot> {
//     throw new Error('Method not implemented.');
//   }
//   orderByChild(path: string): Query {
//     throw new Error('Method not implemented.');
//   }
//   orderByKey(): Query {
//     throw new Error('Method not implemented.');
//   }
//   orderByPriority(): Query {
//     throw new Error('Method not implemented.');
//   }
//   orderByValue(): Query {
//     throw new Error('Method not implemented.');
//   }
//   ref: Reference;
//   startAt(value: string | number | boolean | null, key?: string): Query {
//     throw new Error('Method not implemented.');
//   }
//   startAfter(value: string | number | boolean | null, key?: string): Query {
//     throw new Error('Method not implemented.');
//   }
//   toJSON(): Record<string, any> {
//     throw new Error('Method not implemented.');
//   }
//   toString(): string {
//     throw new Error('Method not implemented.');
//   }
// }

// class MockDatabase implements firebase.database.Database {
//   app: any;
//   refs = new Map<string, MockReference>();

//   getRulesJSON(): Promise<object> {
//     throw new Error('getRulesJSON not implemented.');
//   }
//   setRules(source: string | object | Buffer): Promise<void> {
//     throw new Error('setRules not implemented.');
//   }
//   getRules(): Promise<string> {
//     throw new Error('getRules not implemented.');
//   }
//   useEmulator(host: string, port: number): void {
//     throw new Error('useEmulator not implemented.');
//   }
//   goOffline(): void {
//     throw new Error('goOffline not implemented.');
//   }
//   goOnline(): void {
//     throw new Error('goOnline not implemented.');
//   }
//   ref(path?: string | Reference): Reference {
//     throw new Error('ref not implemented.');
//   }
//   refFromURL(url: string): Reference {
//     throw new Error('refFromURL not implemented.');
//   }
// }

// describe.only('Firebase Controller', () => {
//   const db = new MockDatabase();
//   describe.only('register', () => {
//     it.only('should get a debuggeeId', done => {
//       const debuggee = new Debuggee({
//         project: 'fake-project',
//         uniquifier: 'fake-id',
//         description: 'unit test',
//         agentVersion,
//       });
//       // Write the code I wish I could.
//       const debuggeeId = '123456';
//       const scope = nock(url)
//         .put(api + `/cdbg/debuggees/${debuggeeId}`)
//         .reply(200, {});
//       const controller = new FirebaseController(db);
//       controller.register(debuggee, (err, result) => {
//         assert(!err, 'not expecting an error');
//         assert.ok(result);
//         assert.strictEqual(result!.debuggee.id, debuggeeId);
//         scope.done();
//         done();
//       });
//     });

//     it('should get an agentId', done => {
//       const scope = nock(url)
//         .post(api + '/debuggees/register')
//         .reply(200, {
//           debuggee: {id: 'fake-debuggee'},
//           agentId: 'fake-agent-id',
//           activePeriodSec: 600,
//         });
//       const debuggee = new Debuggee({
//         project: 'fake-project',
//         uniquifier: 'fake-id',
//         description: 'unit test',
//         agentVersion,
//       });
//       const controller = new FirebaseController(db);
//       // TODO: Determine if this type signature is correct.
//       controller.register(debuggee, (err, result) => {
//         assert(!err, 'not expecting an error');
//         assert.ok(result);
//         assert.strictEqual(result!.agentId, 'fake-agent-id');
//         scope.done();
//         done();
//       });
//     });

//     it('should not return an error when the debuggee isDisabled', done => {
//       const scope = nock(url)
//         .post(api + '/debuggees/register')
//         .reply(200, {
//           debuggee: {id: 'fake-debuggee', isDisabled: true},
//           activePeriodSec: 600,
//         });
//       const debuggee = new Debuggee({
//         project: 'fake-project',
//         uniquifier: 'fake-id',
//         description: 'unit test',
//         agentVersion,
//       });
//       const controller = new FirebaseController(db);
//       controller.register(debuggee, (err, result) => {
//         // TODO: Fix this incorrect method signature.
//         (assert as {ifError: Function}).ifError(err, 'not expecting an error');
//         assert.ok(result);
//         assert.strictEqual(result!.debuggee.id, 'fake-debuggee');
//         assert.ok(result!.debuggee.isDisabled);
//         scope.done();
//         done();
//       });
//     });
//   });

//   describe('subscribeToBreakpoints', () => {
//     // register before each test
//     before(done => {
//       nock(url)
//         .post(api + '/debuggees/register')
//         .reply(200, {
//           debuggee: {id: 'fake-debuggee'},
//           activePeriodSec: 600,
//         });
//       const debuggee = new Debuggee({
//         project: 'fake-project',
//         uniquifier: 'fake-id',
//         description: 'unit test',
//         agentVersion,
//       });
//       const controller = new FirebaseController(db);
//       controller.register(debuggee, (err /*, result*/) => {
//         assert.ifError(err);
//         done();
//       });
//     });

//     it('should deal with a missing breakpoints response', done => {
//       const scope = nock(url)
//         .get(api + '/debuggees/fake-debuggee/breakpoints?successOnTimeout=true')
//         .reply(200, {kind: 'whatever'});

//       const debuggee = {id: 'fake-debuggee'};
//       const controller = new FirebaseController(db);
//       // TODO: Fix debuggee to actually implement Debuggee
//       // TODO: Determine if the response parameter should be used.
//       controller.subscribeToBreakpoints(
//         debuggee as Debuggee,
//         (err, breakpoints) => {
//           assert(!err, 'not expecting an error');
//           // TODO: Handle the case where result is undefined
//           assert(!breakpoints, 'should not have a breakpoints property');
//           scope.done();
//           done();
//         }
//       );
//     });

//     describe('invalid responses', () => {
//       const tests: string | Array<{}> = ['', 'JSON, this is not', []];
//       tests.forEach((invalidResponse, index) => {
//         it('should pass test ' + index, done => {
//           const scope = nock(url)
//             .get(
//               api + '/debuggees/fake-debuggee/breakpoints?successOnTimeout=true'
//             )
//             .reply(200, invalidResponse);
//           const debuggee = {id: 'fake-debuggee'};
//           const controller = new FirebaseController(db);
//           controller.subscribeToBreakpoints(
//             debuggee as Debuggee,
//             (err, breakpoints) => {
//               assert(!err, 'not expecting an error');
//               assert(!breakpoints, 'should not have breakpoints property');
//               scope.done();
//               done();
//             }
//           );
//         });
//       });
//     });

//     it('should throw error on http errors', done => {
//       const scope = nock(url)
//         .get(api + '/debuggees/fake-debuggee/breakpoints?successOnTimeout=true')
//         .reply(403);
//       // TODO: Fix debuggee to actually implement Debuggee
//       const debuggee: Debuggee = {id: 'fake-debuggee'} as Debuggee;
//       const controller = new FirebaseController(db);
//       // TODO: Determine if the response parameter should be used.
//       controller.subscribeToBreakpoints(debuggee, (err, breakpoints) => {
//         assert(err instanceof Error, 'expecting an error');
//         assert(!breakpoints, 'should not have any breakpoints');
//         scope.done();
//         done();
//       });
//     });

//     it('should work with waitTokens', done => {
//       const scope = nock(url)
//         .get(api + '/debuggees/fake-debuggee/breakpoints?successOnTimeout=true')
//         .reply(200, {waitExpired: true});
//       // TODO: Fix debuggee to actually implement Debuggee
//       const debuggee: Debuggee = {id: 'fake-debuggee'} as Debuggee;
//       const controller = new FirebaseController(db);
//       // TODO: Determine if the result parameter should be used.
//       controller.subscribeToBreakpoints(debuggee, (err, response) => {
//         // TODO: Fix this incorrect method signature.
//         (assert as {ifError: Function}).ifError(err, 'not expecting an error');
//         // TODO: Fix this error that states `body` is not a property
//         //       of `ServerResponse`.
//         assert(
//           (response as {} as {body: {waitExpired: {}}}).body.waitExpired,
//           'should have expired set'
//         );
//         scope.done();
//         done();
//       });
//     });

//     it('should work with agentId provided from registration', done => {
//       const scope = nock(url)
//         .post(api + '/debuggees/register')
//         .reply(200, {
//           debuggee: {id: 'fake-debuggee'},
//           agentId: 'fake-agent-id',
//           activePeriodSec: 600,
//         })
//         .get(
//           api +
//             '/debuggees/fake-debuggee/breakpoints?successOnTimeout=true&agentId=fake-agent-id'
//         )
//         .reply(200, {waitExpired: true});
//       const debuggee = new Debuggee({
//         project: 'fake-project',
//         uniquifier: 'fake-id',
//         description: 'unit test',
//         agentVersion,
//       });
//       const controller = new FirebaseController(db);
//       controller.register(debuggee, (err1 /*, response1*/) => {
//         assert.ifError(err1);
//         const debuggeeWithId: Debuggee = {id: 'fake-debuggee'} as Debuggee;
//         // TODO: Determine if the result parameter should be used.
//         controller.subscribeToBreakpoints(
//           debuggeeWithId,
//           (err2 /*, response2*/) => {
//             assert.ifError(err2);
//             scope.done();
//             done();
//           }
//         );
//       });
//     });

//     // TODO: Fix this so that each element of the array is actually an
//     //       array of Breakpoints.
//     const testsBreakpoints: stackdriver.Breakpoint[][] = [
//       [],
//       [{id: 'breakpoint-0', location: {path: 'foo.js', line: 18}}],
//     ] as stackdriver.Breakpoint[][];
//     testsBreakpoints.forEach(
//       (breakpoints: stackdriver.Breakpoint[], index: number) => {
//         it('should pass test ' + index, done => {
//           const scope = nock(url)
//             .get(
//               api + '/debuggees/fake-debuggee/breakpoints?successOnTimeout=true'
//             )
//             .reply(200, {breakpoints});
//           // TODO: Fix debuggee to actually implement Debuggee
//           const debuggee: Debuggee = {id: 'fake-debuggee'} as Debuggee;
//           const controller = new FirebaseController(db);
//           // TODO: Determine if the response parameter should be used.
//           controller.subscribeToBreakpoints(debuggee, (err, breakpoints) => {
//             assert(!err, 'not expecting an error');
//             assert(breakpoints, 'should have a breakpoints property');
//             const bps = breakpoints;
//             assert.deepStrictEqual(bps, breakpoints, 'breakpoints mismatch');
//             scope.done();
//             done();
//           });
//         });
//       }
//     );
//   });

//   describe('updateBreakpoint', () => {
//     it('should PUT to server when a breakpoint is updated', done => {
//       // TODO: Fix breakpoint to actually Breakpoint
//       const breakpoint: stackdriver.Breakpoint = {
//         id: 'breakpoint-0',
//         location: {path: 'foo.js', line: 99},
//       } as stackdriver.Breakpoint;
//       // A cast for the second argument to put() is necessary for nock 11
//       // because the type definitions state that the second argument cannot
//       // be an Object even though the nock code itself seems to handle an
//       // Object.  Further, the tests pass when using the cast.
//       // This issue is being tracked in the nock repo at
//       // https://github.com/nock/nock/issues/1731.
//       const scope = nock(url)
//         .put(api + '/debuggees/fake-debuggee/breakpoints/breakpoint-0', {
//           debuggeeId: 'fake-debuggee',
//           breakpoint,
//         } as {})
//         .reply(200, {
//           kind: 'debugletcontroller#updateActiveBreakpointResponse',
//         });
//       // TODO: Fix debuggee to actually implement Debuggee
//       const debuggee: Debuggee = {id: 'fake-debuggee'} as Debuggee;
//       const controller = new FirebaseController(db);
//       controller.updateBreakpoint(
//         debuggee as Debuggee,
//         breakpoint,
//         (err, result) => {
//           assert(!err, 'not expecting an error');
//           assert.strictEqual(
//             (result as {kind: {}}).kind,
//             'debugletcontroller#updateActiveBreakpointResponse'
//           );
//           scope.done();
//           done();
//         }
//       );
//     });
//   });
// });
