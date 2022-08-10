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
}

class MockReference {
  key: string;
  value?: any;
  parentRef?: MockReference;
  children = new Map<string, MockReference>();
  // Simplification: there's only one listener for each event type.
  listeners = new Map<EventType, (a: DataSnapshot, b?: string | null) => any>();

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

  set(value: any, onComplete?: (a: Error | null) => any): Promise<any> {
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
    return Promise.resolve();
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

describe('Firebase Controller', () => {
  const debuggee = new Debuggee({
    project: 'fake-project',
    uniquifier: 'fake-id',
    description: 'unit test',
    agentVersion: 'SomeName/client/SomeVersion',
  });

  describe('register', () => {
    it('should get a debuggeeId', done => {
      const db = new MockDatabase();
      // Debuggee Id is based on the sha1 hash of the json representation of
      // the debuggee.
      const debuggeeId = 'd-b9dbb5e7';
      const controller = new FirebaseController(
        db as {} as firebase.database.Database
      );
      controller.register(debuggee, (err, result) => {
        assert(!err, 'not expecting an error');
        assert.ok(result);
        assert.strictEqual(result!.debuggee.id, debuggeeId);
        assert.strictEqual(
          db.mockRef(`cdbg/debuggees/${debuggeeId}`).value,
          debuggee
        );
        done();
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
  });
});
