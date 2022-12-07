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

import * as assert from 'assert';
import {describe, it} from 'mocha';

import {Debuggee} from '../src/debuggee';
import * as stackdriver from '../src/types/stackdriver';
import * as firebase from 'firebase-admin';

import {FirebaseController} from '../src/agent/firebase-controller';
import {DataSnapshot, EventType, Reference} from '@firebase/database-types';

/* eslint-disable @typescript-eslint/no-explicit-any */
class MockSnapshot {
  key: string;
  value: any;
  constructor(key: string, value: any) {
    this.key = key;
    this.value = value;
  }

  val() {
    return this.value;
  }

  exists() {
    return !!this.value;
  }
}

class MockReference {
  key: string;
  value?: any;
  parentRef?: MockReference;
  children = new Map<string, MockReference>();
  // Simplification: there's only one listener for each event type.
  listeners = new Map<EventType, (a: DataSnapshot, b?: string | null) => any>();

  // Test options
  shouldFailSet = false;
  shouldFailGet = false;
  failSetMessage?: string;
  failGetMessage?: string;

  constructor(key: string, parentRef?: MockReference) {
    this.key = key.slice();
    this.parentRef = parentRef;
  }

  remove(onComplete?: (a: Error | null) => any): Promise<any> {
    if (this.parentRef) {
      this.parentRef.childRemoved(this.key);
      this.parentRef.children.delete(this.key);
    }
    if (onComplete) {
      onComplete(null);
    }
    return Promise.resolve();
  }

  async get(): Promise<DataSnapshot> {
    if (this.shouldFailGet) {
      console.log('FAIL');
      this.shouldFailGet = false;
      throw new Error(this.failGetMessage);
    }
    return new MockSnapshot(this.key, this.value) as {} as DataSnapshot;
  }

  getOrAdd(key: string): MockReference {
    if (!this.children.has(key)) {
      this.children.set(key, new MockReference(key, this));
    }
    return this.children.get(key)!;
  }

  childRemoved(key: string) {
    if (this.listeners.has('child_removed')) {
      this.listeners.get('child_removed')!(
        new MockSnapshot(key, {}) as {} as DataSnapshot
      );
    }
    if (this.parentRef) {
      this.parentRef.childRemoved(`${this.key}/${key}`);
    }
  }

  childAdded(key: string, value: any) {
    if (this.listeners.has('child_added')) {
      this.listeners.get('child_added')!(
        new MockSnapshot(key, value) as {} as DataSnapshot
      );
    }
    if (this.parentRef) {
      this.parentRef.childAdded(`${this.key}/${key}`, value);
    }
  }

  async set(value: any, onComplete?: (a: Error | null) => any): Promise<any> {
    if (this.shouldFailSet) {
      this.shouldFailSet = false;
      const err = new Error(this.failSetMessage);
      if (onComplete) {
        onComplete(err);
      }
      throw err;
    }

    let creating = false;
    if (!this.value) {
      creating = true;
    }
    this.value = value;
    if (onComplete) {
      onComplete(null);
    }
    if (creating && this.parentRef) {
      this.parentRef.childAdded(this.key, value);
    }
  }

  on(
    eventType: EventType,
    callback: (a: DataSnapshot, b?: string | null) => any
  ): (a: DataSnapshot | null, b?: string | null) => any {
    this.listeners.set(eventType, callback);

    // Callback will be called with each existing child: https://firebase.google.com/docs/database/admin/retrieve-data#child-added
    if (eventType === 'child_added') {
      this.children.forEach(child => this.childAdded(child.key, child.value));
    }
    // Don't care about return value.
    return () => null;
  }

  off() {
    // No-op.  Needed to cleanly detach in the real firebase implementation.
  }

  failNextSet(errorMessage: string) {
    this.shouldFailSet = true;
    this.failSetMessage = errorMessage;
  }

  failNextGet(errorMessage: string) {
    this.shouldFailGet = true;
    this.failGetMessage = errorMessage;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

class MockDatabase {
  root = new MockReference('');
  mockRef(path: string): MockReference {
    const parts = path.split('/');
    let ref = this.root;
    for (let i = 0; i < parts.length; i++) {
      ref = ref.getOrAdd(parts[i]);
    }
    return ref;
  }
  ref(path: string): Reference {
    return this.mockRef(path) as {} as Reference;
  }
}

describe.only('Firebase Controller', () => {
  const debuggee = new Debuggee({
    project: 'fake-project',
    uniquifier: 'fake-id',
    description: 'unit test',
    agentVersion: 'SomeName/client/SomeVersion',
    labels: {
      V8_version: 'v8_version',
      process_title: 'node',
      projectid: 'fake-project',
      agent_version: '7.x',
      version: 'appengine_version',
      minorversion: 'minor_version',
    },
  });
  // Debuggee Id is based on the sha1 hash of the json representation of
  // the debuggee.
  const debuggeeId = 'd-cbd029da';

  describe.only('register', () => {
    it('should error out gracefully on presence check', done => {
      const db = new MockDatabase();
      const controller = new FirebaseController(
        db as {} as firebase.database.Database
      );
      db.mockRef(
        `cdbg/debuggees/${debuggeeId}/registrationTimeUnixMsec`
      ).failNextGet('mocked failure');
      controller.register(debuggee, (err, result) => {
        try {
          assert(err, 'expecting an error');
          done();
        } catch (err) {
          done(err);
        }
      });
    });
    describe('first time', () => {
      it('should write successfully', done => {
        const db = new MockDatabase();
        const controller = new FirebaseController(
          db as {} as firebase.database.Database
        );
        const expectedDebuggee = {
          ...debuggee,
          registrationTimeUnixMsec: {'.sv': 'timestamp'},
          lastUpdateTimeUnixMsec: {'.sv': 'timestamp'},
          id: debuggeeId,
          canaryMode: 'CANARY_MODE_UNSPECIFIED',
        };

        controller.register(debuggee, (err, result) => {
          // try/catch block to avoid losing failed assertions to the error
          // handling in controller.register.
          try {
            assert(!err, 'not expecting an error');
            assert.ok(result);
            assert.strictEqual(result!.debuggee.id, debuggeeId);
            assert.deepEqual(
              db.mockRef(`cdbg/debuggees/${debuggeeId}`).value,
              expectedDebuggee
            );
            done();
          } catch (err) {
            done(err);
          }
        });
      });
      it('should error out gracefully', done => {
        const db = new MockDatabase();
        db.mockRef(`cdbg/debuggees/${debuggeeId}`).failNextSet(
          'mocked failure'
        );
        const controller = new FirebaseController(
          db as {} as firebase.database.Database
        );
        controller.register(debuggee, (err, result) => {
          try {
            assert(err, 'expecting an error');
            done();
          } catch (err) {
            done(err);
          }
        });
      });
    });
    describe('re-register', () => {
      it('should only update the timestamp', done => {
        const db = new MockDatabase();
        const controller = new FirebaseController(
          db as {} as firebase.database.Database
        );
        // Throw an error if the debuggee is written; there should be no write.
        db.mockRef(`cdbg/debuggees/${debuggeeId}`).failNextSet(
          'should not be called'
        );
        // This is all that is required to indicate a prior registration.
        db.mockRef(`cdbg/debuggees/${debuggeeId}/registrationTimeUnixMsec`).set(
          12345678
        );

        controller.register(debuggee, (err, result) => {
          try {
            assert(!err, 'not expecting an error');
            assert.ok(result);
            // In production this would be the actual timestamp.
            assert.deepEqual(
              db.mockRef(`cdbg/debuggees/${debuggeeId}/lastUpdateTimeUnixMsec`)
                .value,
              {'.sv': 'timestamp'}
            );
            done();
          } catch (err) {
            done(err);
          }
        });
      });
    });
  });

  describe('subscribeToBreakpoints', () => {
    const breakpoints = [
      {id: 'breakpoint-0', location: {path: 'foo.js', line: 18}},
      {id: 'breakpoint-1', location: {path: 'bar.js', line: 23}},
    ];
    const debuggee: Debuggee = {id: 'fake-debuggee'} as Debuggee;

    it('should notice added and removed breakpoints', done => {
      const db = new MockDatabase();
      const controller = new FirebaseController(
        db as {} as firebase.database.Database
      );
      controller.debuggeeId = 'debuggeeId';

      // Add a breakpoint before listening.
      db.mockRef(`cdbg/breakpoints/debuggeeId/active/${breakpoints[0].id}`).set(
        breakpoints[0]
      );

      const expectedResults = [
        [breakpoints[0]],
        [breakpoints[0], breakpoints[1]],
        [breakpoints[1]],
      ];
      let callbackCount = 0;
      controller.subscribeToBreakpoints(debuggee, (err, bps) => {
        assert(!err, 'not expecting an error');
        assert.deepStrictEqual(
          bps,
          expectedResults[callbackCount],
          'breakpoints mismatch'
        );
        callbackCount++;
        if (callbackCount === expectedResults.length) {
          controller.stop();
          done();
        }
      });

      db.mockRef(`cdbg/breakpoints/debuggeeId/active/${breakpoints[1].id}`).set(
        breakpoints[1]
      );
      db.mockRef(
        `cdbg/breakpoints/debuggeeId/active/${breakpoints[0].id}`
      ).remove();
    });
  });

  describe('updateBreakpoint', () => {
    it('should update the database correctly for snapshots', done => {
      const breakpointId = 'breakpointId';
      const debuggeeId = 'debuggeeId';
      const breakpoint: stackdriver.Breakpoint = {
        id: breakpointId,
        action: 'CAPTURE',
        location: {path: 'foo.js', line: 99},
      } as stackdriver.Breakpoint;
      const debuggee: Debuggee = {id: 'fake-debuggee'} as Debuggee;
      const db = new MockDatabase();
      const controller = new FirebaseController(
        db as {} as firebase.database.Database
      );
      controller.debuggeeId = debuggeeId;

      let removed = false;
      db.ref(`cdbg/breakpoints/${debuggeeId}/active`).on(
        'child_removed',
        data => {
          assert.strictEqual(data.key, breakpointId);
          removed = true;
        }
      );

      let finalized = false;
      db.ref(`cdbg/breakpoints/${debuggeeId}/final`).on('child_added', data => {
        assert.strictEqual(data.key, breakpointId);
        assert.deepStrictEqual(data.val(), {
          ...breakpoint,
          isFinalState: true,
          finalTimeUnixMsec: {'.sv': 'timestamp'},
        });
        finalized = true;
      });

      let snapshotted = false;
      db.ref(`cdbg/breakpoints/${debuggeeId}/snapshot`).on(
        'child_added',
        data => {
          assert.strictEqual(data.key, breakpointId);
          assert.deepStrictEqual(data.val(), {
            ...breakpoint,
            isFinalState: true,
            finalTimeUnixMsec: {'.sv': 'timestamp'},
          });
          snapshotted = true;
        }
      );

      controller.updateBreakpoint(debuggee as Debuggee, breakpoint, err => {
        assert(!err, 'not expecting an error');
        assert(removed, 'should have been removed');
        assert(finalized, 'should have been finalized');
        assert(snapshotted, 'should have been snapshotted');
        done();
      });
    });
    it('should update the database correctly for logpoints', done => {
      const breakpointId = 'breakpointId';
      const debuggeeId = 'debuggeeId';
      const breakpoint: stackdriver.Breakpoint = {
        id: breakpointId,
        action: 'LOG',
        location: {path: 'foo.js', line: 99},
      } as stackdriver.Breakpoint;
      const debuggee: Debuggee = {id: 'fake-debuggee'} as Debuggee;
      const db = new MockDatabase();
      const controller = new FirebaseController(
        db as {} as firebase.database.Database
      );
      controller.debuggeeId = debuggeeId;

      let removed = false;
      db.ref(`cdbg/breakpoints/${debuggeeId}/active`).on(
        'child_removed',
        data => {
          assert.strictEqual(data.key, breakpointId);
          removed = true;
        }
      );

      let finalized = false;
      db.ref(`cdbg/breakpoints/${debuggeeId}/final`).on('child_added', data => {
        assert.strictEqual(data.key, breakpointId);
        assert.deepStrictEqual(data.val(), {
          ...breakpoint,
          isFinalState: true,
          finalTimeUnixMsec: {'.sv': 'timestamp'},
        });
        finalized = true;
      });

      let snapshotted = false;
      db.ref(`cdbg/breakpoints/${debuggeeId}/snapshot`).on(
        'child_added',
        () => {
          snapshotted = true;
        }
      );

      controller.updateBreakpoint(debuggee as Debuggee, breakpoint, err => {
        assert(!err, 'not expecting an error');
        assert(removed, 'should have been removed');
        assert(finalized, 'should have been finalized');
        assert(!snapshotted, 'should not have been snapshotted');
        done();
      });
    });
    it('should throw an error if the delete fails', done => {
      const breakpointId = 'breakpointId';
      const debuggeeId = 'debuggeeId';
      const breakpoint: stackdriver.Breakpoint = {
        id: breakpointId,
        action: 'CAPTURE',
        location: {path: 'foo.js', line: 99},
      } as stackdriver.Breakpoint;
      const debuggee: Debuggee = {id: 'fake-debuggee'} as Debuggee;
      const db = new MockDatabase();
      const controller = new FirebaseController(
        db as {} as firebase.database.Database
      );
      controller.debuggeeId = debuggeeId;

      db.ref(`cdbg/breakpoints/${debuggeeId}/active`).on(
        'child_removed',
        data => {
          throw new Error('mock remove failure');
        }
      );

      let finalized = false;
      db.ref(`cdbg/breakpoints/${debuggeeId}/final`).on('child_added', data => {
        finalized = true;
      });

      let snapshotted = false;
      db.ref(`cdbg/breakpoints/${debuggeeId}/snapshot`).on(
        'child_added',
        data => {
          snapshotted = true;
        }
      );
      controller.updateBreakpoint(debuggee as Debuggee, breakpoint, err => {
        assert(err, 'expecting an error');
        assert(!finalized, 'should not have been finalized');
        assert(!snapshotted, 'should not have been snapshotted');
        done();
      });
    });
    it('throw an error if the finalization fails', done => {
      const breakpointId = 'breakpointId';
      const debuggeeId = 'debuggeeId';
      const breakpoint: stackdriver.Breakpoint = {
        id: breakpointId,
        action: 'CAPTURE',
        location: {path: 'foo.js', line: 99},
      } as stackdriver.Breakpoint;
      const debuggee: Debuggee = {id: 'fake-debuggee'} as Debuggee;
      const db = new MockDatabase();
      const controller = new FirebaseController(
        db as {} as firebase.database.Database
      );
      controller.debuggeeId = debuggeeId;

      let removed = false;
      db.ref(`cdbg/breakpoints/${debuggeeId}/active`).on(
        'child_removed',
        data => {
          assert.strictEqual(data.key, breakpointId);
          removed = true;
        }
      );

      db.ref(`cdbg/breakpoints/${debuggeeId}/final`).on('child_added', data => {
        assert.strictEqual(data.key, breakpointId);
        throw new Error('mock write failure');
      });

      let snapshotted = false;
      db.ref(`cdbg/breakpoints/${debuggeeId}/snapshot`).on(
        'child_added',
        data => {
          snapshotted = true;
        }
      );

      controller.updateBreakpoint(debuggee as Debuggee, breakpoint, err => {
        assert(err, 'expecting an error');
        assert(removed, 'should have been removed');
        assert(snapshotted, 'should have been snapshotted');
        done();
      });
    });
    it('throw an error if writing the snapshot fails', done => {
      const breakpointId = 'breakpointId';
      const debuggeeId = 'debuggeeId';
      const breakpoint: stackdriver.Breakpoint = {
        id: breakpointId,
        action: 'CAPTURE',
        location: {path: 'foo.js', line: 99},
      } as stackdriver.Breakpoint;
      const debuggee: Debuggee = {id: 'fake-debuggee'} as Debuggee;
      const db = new MockDatabase();
      const controller = new FirebaseController(
        db as {} as firebase.database.Database
      );
      controller.debuggeeId = debuggeeId;

      let removed = false;
      db.ref(`cdbg/breakpoints/${debuggeeId}/active`).on(
        'child_removed',
        data => {
          assert.strictEqual(data.key, breakpointId);
          removed = true;
        }
      );

      let finalized = false;
      db.ref(`cdbg/breakpoints/${debuggeeId}/final`).on('child_added', data => {
        assert.strictEqual(data.key, breakpointId);
        assert.deepStrictEqual(data.val(), {
          ...breakpoint,
          isFinalState: true,
          finalTimeUnixMsec: {'.sv': 'timestamp'},
        });
        finalized = true;
      });

      db.ref(`cdbg/breakpoints/${debuggeeId}/snapshot`).on(
        'child_added',
        data => {
          throw new Error('mock snapshot write failure');
        }
      );

      controller.updateBreakpoint(debuggee as Debuggee, breakpoint, err => {
        assert(err, 'expecting an error');
        assert(removed, 'should have been removed');
        assert(!finalized, 'should not have been finalized');
        done();
      });
    });
  });
});
