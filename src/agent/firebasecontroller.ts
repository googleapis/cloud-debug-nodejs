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
import * as qs from 'querystring';
import * as t from 'teeny-request';

import { Controller } from './controller';
import { Debuggee } from '../debuggee';
import * as stackdriver from '../types/stackdriver';

import * as firebase from 'firebase-admin';


export class FirebaseController implements Controller {
    databaseUrl: string;
    credPath: string;

    db: firebase.database.Database;
    debuggeeId?: string;

    /**
     * @constructor
     */

    constructor() {
        this.databaseUrl = "https://tanks-a-lot-game-default-rtdb.firebaseio.com";
        this.credPath = "C:\\Users\\jwmct\\Downloads\\tanks-a-lot-game-firebase-adminsdk-ftm94-13208486d7.json"

        var serviceAccount = require(this.credPath);

        firebase.initializeApp({
            credential: firebase.credential.cert(serviceAccount),
            databaseURL: "https://tanks-a-lot-game-default-rtdb.firebaseio.com"
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

        const debuggeeRef = this.db.ref(`debuggees/${this.debuggeeId}`);
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

        const bpRef = this.db.ref(`breakpoints/${this.debuggeeId}/active`);

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

        breakpoint.action = 'CAPTURE';
        breakpoint.isFinalState = true;

        // TODO: error handling
        // TODO: break details & summary into different destinations so that getting all final breakpoints is less expensive.
        this.db.ref(`breakpoints/${this.debuggeeId}/active/${breakpoint.id}`).remove();
        this.db.ref(`breakpoints/${this.debuggeeId}/final/${breakpoint.id}`).set(breakpoint);
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

        const bpRef = this.db.ref(`breakpoints/${this.debuggeeId}/active`);

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
}
