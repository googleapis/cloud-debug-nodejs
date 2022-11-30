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
import * as gcpMetadata from 'gcp-metadata';

import * as util from 'util';
const debuglog = util.debuglog('cdbg.firebase');

export class FirebaseController implements Controller {
  db: firebase.database.Database;
  debuggeeId?: string;
  bpRef?: firebase.database.Reference;

  /**
   * Connects to the Firebase database.
   *
   * The project Id passed in options is preferred over any other sources.
   *
   * @param options specifies which database and credentials to use
   * @returns database connection
   */
  static async initialize(options: {
    keyPath?: string;
    databaseUrl?: string;
    projectId?: string;
  }): Promise<firebase.database.Database> {
    let credential = undefined;
    let projectId = options.projectId;

    if (options.keyPath) {
      // Use the project id and credentials in the path specified by the keyPath.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const serviceAccount = require(options.keyPath);
      projectId = projectId ?? serviceAccount['project_id'];
      credential = firebase.credential.cert(serviceAccount);
    } else {
      if (!projectId) {
        // Try grabbing it from the GCE metadata server.
        if (await gcpMetadata.isAvailable()) {
          projectId = await gcpMetadata.project('project-id');
        }
      }
    }

    if (!projectId) {
      throw new Error('Cannot determine project ID');
    }

    // Build the database URL.
    let databaseUrl: string;
    if (options.databaseUrl) {
      databaseUrl = options.databaseUrl;
    } else {
      // TODO: Add fallback to -default
      databaseUrl = `https://${projectId}-cdbg.firebaseio.com`;
    }

    let app : firebase.app.App;
    if (credential) {
      app = firebase.initializeApp({
        credential: credential,
        databaseURL: databaseUrl,
      }, 'cdbg');
    } else {
      // Use the default credentials.
      app = firebase.initializeApp({
        databaseURL: databaseUrl,
      }, 'cdbg');
    }

    const db = firebase.database();

    // Test the connection by reading the schema version.
    try {
      const version_snapshot = await db.ref('cdbg/schema_version').get();
      if (version_snapshot) {
        const version = version_snapshot.val();
        debuglog(`Firebase app initialized.  Connected to ${databaseUrl}` +
                 ` with schema version ${version}`);
      } else {
        app.delete();
        throw new Error('failed to fetch schema version from database');
      }
    } catch (e) {
      app.delete();
      throw(e);
    }

    debuglog('Firebase app initialized.  Connected to', databaseUrl);
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
    debuglog('registering');
    // Firebase hates undefined attributes.  Patch the debuggee, just in case.
    if (!debuggee.canaryMode) {
      debuggee.canaryMode = 'CANARY_MODE_UNSPECIFIED';
    }

    // Calculate the debuggee id as the hash of the object.
    // This MUST be consistent across all debuggee instances.
    // TODO: JSON.stringify may provide different strings if labels are added
    // in different orders.
    debuggee.id = '';  // Don't use the debuggee id when computing the id.
    const debuggeeHash = crypto
      .createHash('sha1')
      .update(JSON.stringify(debuggee))
      .digest('hex');
    this.debuggeeId = `d-${debuggeeHash.substring(0, 8)}`;
    debuggee.id = this.debuggeeId;

    const debuggeeRef = this.db.ref(`cdbg/debuggees/${this.debuggeeId}`);
    debuggeeRef.set(debuggee, (err) => {
      if (err) {
        callback(err);
      } else {
        const agentId = 'unsupported';
        callback(null, {debuggee, agentId});
      }
    });
  }

  /**
   * Update the server about breakpoint state
   * @param {!Debuggee} debuggee
   * @param {!Breakpoint} breakpoint
   * @param {!Function} callback accepting (err, body)
   */
  async updateBreakpoint(
    debuggee: Debuggee,
    breakpoint: stackdriver.Breakpoint,
    callback: (err?: Error, body?: {}) => void
  ): Promise<void> {
    debuglog('updating a breakpoint');
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const breakpoint_map: {[key: string]: any} = {...breakpoint};

    // Magic value. Firebase RTDB will replace the {'.sv': 'timestamp'} with
    // the unix time since epoch in milliseconds.
    // https://firebase.google.com/docs/reference/rest/database#section-server-values
    breakpoint_map['finalTimeUnixMsec'] = {'.sv': 'timestamp'};

    try {
      await this.db
        .ref(`cdbg/breakpoints/${this.debuggeeId}/active/${breakpoint.id}`)
        .remove();
    } catch (err) {
      debuglog(`failed to delete breakpoint ${breakpoint.id}: ` + err);
      callback(err as Error);
      throw err;
    }

    try {
      if (is_snapshot) {
        // We could also restrict this to only write to this node if it wasn't
        // an error and there is actual snapshot data. For now though we'll
        // write it regardless, makes sense if you want to get everything for
        // a snapshot it's at this location, regardless of what it contains.
        await this.db
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

      await this.db
        .ref(`cdbg/breakpoints/${this.debuggeeId}/final/${breakpoint.id}`)
        .set(breakpoint_map);
    } catch (err) {
      debuglog(`failed to finalize breakpoint ${breakpoint.id}: ` + err);
      callback(err as Error);
      throw err;
    }

    // Indicate success to the caller.
    callback();
  }

  subscribeToBreakpoints(
    debuggee: Debuggee,
    callback: (err: Error | null, breakpoints: stackdriver.Breakpoint[]) => void
  ): void {
    debuglog('Started subscription for breakpoint updates');
    assert(debuggee.id, 'should have a registered debuggee');

    this.bpRef = this.db.ref(`cdbg/breakpoints/${this.debuggeeId}/active`);

    let breakpoints = [] as stackdriver.Breakpoint[];
    this.bpRef.on('child_added', (snapshot: firebase.database.DataSnapshot) => {
      debuglog(`new breakpoint: ${snapshot.key}`);
      const breakpoint = snapshot.val();
      breakpoint.id = snapshot.key;
      breakpoints.push(breakpoint);
      callback(null, breakpoints);
    }, (e: Error) => {
      debuglog(`unable to listen to child_added events on ` +
               `cdbg/breakpoints/${this.debuggeeId}/active. ` +
               `Please check your database settings.`);
      callback(e, []);
    });
    this.bpRef.on('child_removed', snapshot => {
      // remove the breakpoint.
      const bpId = snapshot.key;
      breakpoints = breakpoints.filter(bp => bp.id !== bpId);
      debuglog(`breakpoint removed: ${bpId}`);
      callback(null, breakpoints);
    }, (e: Error) => {
      debuglog(`unable to listen to child_removed events on ` +
               `cdbg/breakpoints/${this.debuggeeId}/active. ` +
               `Please check your database settings.`);
      callback(e, []);
    });
  }

  stop(): void {
    if (this.bpRef) {
      this.bpRef.off();
      this.bpRef = undefined;
    }
    try {
      firebase.app('cdbg').delete();
    } catch (err) {
      debuglog(`failed to tear down firebase app: ${err})`);
    }
  }
}
