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

/*!
 * @module debug/firebase-controller
 */

import * as assert from 'assert';

import {Controller} from './controller';
import {Debuggee} from '../debuggee';
import * as stackdriver from '../types/stackdriver';
import * as crypto from 'crypto';

import * as firebase from 'firebase-admin';

export class FirebaseController implements Controller {
  db: firebase.database.Database;
  debuggeeId?: string;

  /**
   * Connects to the Firebase database.
   * @param options specifies which database and credentials to use
   * @returns database connection
   */
  static initialize(options: {
    keyPath?: string;
    databaseUrl?: string;
  }): firebase.database.Database {
    let credential = undefined;
    let projectId = undefined;
    if (options.keyPath) {
      // Use the project id and credentials in the path specified by the keyPath.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const serviceAccount = require(options.keyPath);
      projectId = serviceAccount['project_id'];
      credential = firebase.credential.cert(serviceAccount);
    } else {
      // TODO: Find out how to find the project ID.
      projectId = 'TBD';
    }

    // Build the database URL.
    let databaseUrl: string;
    if (options.databaseUrl) {
      databaseUrl = options.databaseUrl;
    } else {
      // TODO: Test whether this exists.  If not, fall back to -default.
      databaseUrl = `https://${projectId}-cdbg.firebaseio.com`;
    }

    if (credential) {
      firebase.initializeApp({
        credential: credential,
        databaseURL: databaseUrl,
      });
    } else {
      // Use the default credentials.
      firebase.initializeApp({
        databaseURL: databaseUrl,
      });
    }

    const db = firebase.database();

    // TODO: Test this setup and emit a reasonable error.
    console.log('Firebase app initialized.  Connected to', databaseUrl);
    return db;
  }

  /**
   * @constructor
   */
  constructor(db: firebase.database.Database) {
    this.db = db;
  }

  getProjectId(): string {
    // TODO: Confirm that this is set in all supported cases.
    return this.db.app.options.projectId ?? 'unknown';
  }

  /**
   * Register to the API (implementation)
   *
   * @param {!function(?Error,Object=)} callback
   * @private
   */
  register(
    debuggee: Debuggee,
    callback: (
      err: Error | null,
      result?: {
        debuggee: Debuggee;
        agentId: string;
      }
    ) => void
  ): void {
    console.log('registering');
    // Firebase hates undefined attributes.  Patch the debuggee, just in case.
    if (!debuggee.canaryMode) {
      debuggee.canaryMode = 'CANARY_MODE_UNSPECIFIED';
    }

    // Calculate the debuggee id as the hash of the object.
    // This MUST be consistent across all debuggee instances.
    this.debuggeeId = crypto
      .createHash('md5')
      .update(JSON.stringify(debuggee))
      .digest('hex');
    debuggee.id = this.debuggeeId;

    const debuggeeRef = this.db.ref(`cdbg/debuggees/${this.debuggeeId}`);
    debuggeeRef.set(debuggee);

    // TODO: Handle errors.  I can .set(data, (error) => if (error) {})
    const agentId = 'unsupported';
    callback(null, {debuggee, agentId});
  }

  /**
   * Update the server about breakpoint state
   * @param {!Debuggee} debuggee
   * @param {!Breakpoint} breakpoint
   * @param {!Function} callback accepting (err, body)
   */
  updateBreakpoint(
    debuggee: Debuggee,
    breakpoint: stackdriver.Breakpoint,
    callback: (err?: Error, body?: {}) => void
  ): void {
    console.log('updating a breakpoint');
    assert(debuggee.id, 'should have a registered debuggee');

    // By default if action is not present, it's a snapshot, so for it to be
    // a logpoint it must be present and equal to 'LOG', anything else is a
    // snapshot.
    const is_logpoint = breakpoint.action === 'LOG';
    const is_snapshot = !is_logpoint;

    if (is_snapshot) {
      breakpoint.action = 'CAPTURE';
    }

    breakpoint.isFinalState = true;

    const breakpoint_map: {[key: string]: any} = {...breakpoint};

    // Magic value. Firebase RTDB will replace the {'.sv': 'timestamp'} with
    // the unix time since epoch in milliseconds.
    // https://firebase.google.com/docs/reference/rest/database#section-server-values
    breakpoint_map['finalTimeUnixMsec'] = {'.sv': 'timestamp'};

    // TODO: error handling from here on
    this.db
      .ref(`cdbg/breakpoints/${this.debuggeeId}/active/${breakpoint.id}`)
      .remove();

    if (is_snapshot) {
      // We could also restrict this to only write to this node if it wasn't
      // an error and there is actual snapshot data. For now though we'll
      // write it regardless, makes sense if you want to get everything for
      // a snapshot it's at this location, regardless of what it contains.
      this.db
        .ref(`cdbg/breakpoints/${this.debuggeeId}/snapshot/${breakpoint.id}`)
        .set(breakpoint_map);
      // Now strip the snapshot data for the write to 'final' path.
      const fields_to_strip = [
        'evaluatedExpressions',
        'stackFrames',
        'variableTable',
      ];
      fields_to_strip.forEach(field => delete breakpoint_map[field]);
    }

    this.db
      .ref(`cdbg/breakpoints/${this.debuggeeId}/final/${breakpoint.id}`)
      .set(breakpoint_map);

    // Indicate success to the caller.
    callback();
  }

  subscribeToBreakpoints(
    debuggee: Debuggee,
    callback: (err: Error | null, breakpoints: stackdriver.Breakpoint[]) => void
  ): void {
    console.log('Started subscription for breakpoint updates');
    assert(debuggee.id, 'should have a registered debuggee');

    const bpRef = this.db.ref(`cdbg/breakpoints/${this.debuggeeId}/active`);

    let breakpoints = [] as stackdriver.Breakpoint[];
    bpRef.on('child_added', (snapshot: firebase.database.DataSnapshot) => {
      console.log(`new breakpoint: ${snapshot.key}`);
      const breakpoint = snapshot.val();
      breakpoint.id = snapshot.key;
      breakpoints.push(breakpoint);
      callback(null, breakpoints);
    });
    bpRef.on('child_removed', snapshot => {
      // remove the breakpoint.
      const bpId = snapshot.key;
      breakpoints = breakpoints.filter(bp => bp.id !== bpId);
      console.log(`breakpoint removed: ${bpId}`);
      callback(null, breakpoints);
    });
  }

  stop(): void {
    // No-op.
  }
}
