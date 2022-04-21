// Copyright 2014 Google LLC
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
 * @module debug/oneplatformcontroller
 */

import * as assert from 'assert';
import * as t from 'teeny-request';

import { Controller } from './controller';
import { Debuggee } from '../debuggee';
import * as stackdriver from '../types/stackdriver';

import * as firebase from 'firebase-admin';


export class FirebaseController implements Controller {
    databaseUrl: string;

    db: firebase.database.Database;
    debuggeeId?: string;

    /**
     * @constructor
     */

    constructor(keyPath: string, databaseUrl?: string) {
        // FIXME: Figure out what the project ID is.
        const projectId = "vaporware";
        this.databaseUrl = databaseUrl ?? `https://${projectId}-cdbg.firebaseio.com`;

        var serviceAccount = require(keyPath);

        firebase.initializeApp({
            credential: firebase.credential.cert(serviceAccount),
            databaseURL: this.databaseUrl,
        });

        this.db = firebase.database();
        // TODO: Make these configurable and make them based on project id.
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
        this.debuggeeId = '123456';  // TODO: Calculate this.
        debuggee.id = this.debuggeeId;

        const debuggeeRef = this.db.ref(`cdbg/debuggees/${this.debuggeeId}`);
        debuggeeRef.set(debuggee);

        // TODO: Handle errors.  I can .set(data, (error) => if (error) {})
        const agentId = 'this does not matter';
        callback(null, { debuggee, agentId });
    }

    /**
     * Fetch the list of breakpoints from the server. Assumes we have registered.
     * @param {!function(?Error,Object=,Object=)} callback accepting (err, response,
     * body)
     */
    listBreakpoints(
        debuggee: Debuggee,
        callback: (
            err: Error | null,
            response?: t.Response,
            body?: stackdriver.ListBreakpointsResponse
        ) => void
    ): void {
        console.log('listing active breakpoints.  WIP');
        assert(debuggee.id, 'should have a registered debuggee');

        const bpRef = this.db.ref(`cdbg/breakpoints/${this.debuggeeId}/active`);

        /*
        Here's where the data model breaks down between the two implementations.
        What I need is a callback that is called every time that the breakpoint set changes.
        This means going in and changing the oneplatform controller to keep the listactivebreakpoints
        polling going on at all times.
        For the time being, I'll see if I can hamstring the firebase implementation into only returning once.
        */
        let breakpoints = [] as stackdriver.Breakpoint[];
        bpRef.on('child_added', (snapshot) => {
            breakpoints.push(snapshot.val());
        });
        bpRef.on('child_removed', (snapshot) => {
            // remove the breakpoint.
            const bpId = snapshot.val();
            console.log(`breakpoint lost: ${bpId}`);
        });

        // TODO: Holy heck, this is wrong.  There needs to be a *much* better API.
        callback(null, { statusCode: 200 } as t.Response, { breakpoints, waitExpired: false } as stackdriver.ListBreakpointsResponse);
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
        const is_snapshot = !is_logpoint

        if (is_snapshot) {
          breakpoint.action = 'CAPTURE';
        }

        breakpoint.isFinalState = true;

        let breakpoint_map: {[key: string]: any} = {...breakpoint}

        // Magic value. Firebase RTDB will replace the {'.sv': 'timestamp'} with
        // the unix time since epoch in milliseconds.
        // https://firebase.google.com/docs/reference/rest/database#section-server-values
        breakpoint_map['finalTimeUnixMsec'] = {'.sv': 'timestamp'}

        // TODO: error handling from here on
        this.db.ref(`cdbg/breakpoints/${this.debuggeeId}/active/${breakpoint.id}`).remove();

        if (is_snapshot) {
          // We could also restrict this to only write to this node if it wasn't
          // an error and there is actual snapshot data. For now though we'll
          // write it regardless, makes sense if you want to get everything for
          // a snapshot it's at this location, regardless of what it contains.
          this.db.ref(`cdbg/breakpoints/${this.debuggeeId}/snapshot/${breakpoint.id}`).set(breakpoint_map);
          // Now strip the snapshot data for the write to 'final' path.
          const fields_to_strip = ['evaluatedExpressions', 'stackFrames', 'variableTable']
          fields_to_strip.forEach((field) => delete breakpoint_map[field])
        }

        this.db.ref(`cdbg/breakpoints/${this.debuggeeId}/final/${breakpoint.id}`).set(breakpoint_map);
    }

    subscribeToBreakpoints(
        debuggee: Debuggee,
        callback: (
            err: Error | null,
            breakpoints: stackdriver.Breakpoint[]
        ) => void
    ): void {
        console.log('Started subscription for breakpoint updates');
        assert(debuggee.id, 'should have a registered debuggee');

        const bpRef = this.db.ref(`cdbg/breakpoints/${this.debuggeeId}/active`);

        let breakpoints = [] as stackdriver.Breakpoint[];
        bpRef.on('child_added', (snapshot: firebase.database.DataSnapshot) => {
            console.log(`new breakpoint: ${snapshot.key}`);
            let breakpoint = snapshot.val();
            breakpoint.id = snapshot.key;
            breakpoints.push(breakpoint);
            callback(null, breakpoints);
        });
        bpRef.on('child_removed', (snapshot) => {
            // remove the breakpoint.
            const bpId = snapshot.key;
            breakpoints = breakpoints.filter(bp => bp.id != bpId);
            console.log(`breakpoint removed: ${bpId}`);
            callback(null, breakpoints);
        });
    }


    stop(): void {
        // No-op.
    }
}
