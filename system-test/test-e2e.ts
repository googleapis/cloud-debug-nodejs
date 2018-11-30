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

import * as assert from 'assert';
import * as cp from 'child_process';
import * as util from 'util';
import * as uuid from 'uuid';

import {Debug} from '../src/client/stackdriver/debug';
import * as stackdriver from '../src/types/stackdriver';
import {Debugger} from '../test/debugger';

const CLUSTER_WORKERS = 3;

const FILENAME = 'build/test/fixtures/fib.js';

const UUID = uuid.v4();
const LOG_MESSAGE_FORMAT = UUID + ': o is: $0';
const REGEX =
    new RegExp(`LOGPOINT: ${UUID}: o is: {"a":\\[1,"hi",true\\]}`, 'g');

const delay = (delayTimeMS: number): Promise<void> => {
  return new Promise(r => setTimeout(r, delayTimeMS));
};

interface Child {
  transcript: string;
  process?: cp.ChildProcess;
}

// This test could take up to 100 seconds.
describe('@google-cloud/debug end-to-end behavior', () => {
  let api: Debugger;

  let debuggeeId: string|null;
  let projectId: string|null;
  let children: Child[] = [];

  before(() => {
    const packageInfo = {name: 'Some name', version: 'Some version'};
    api = new Debugger(new Debug({}, packageInfo));
  });

  beforeEach(function() {
    this.timeout(10 * 1000);
    return new Promise((resolve, reject) => {
      let numChildrenReady = 0;

      // Process a status message sent from a child process.
      const handler =
          (c: {error: Error|null, debuggeeId: string, projectId: string}) => {
            console.log(c);
            if (c.error) {
              reject(new Error(
                  'A child reported the following error: ' + c.error));
              return;
            }
            if (!debuggeeId) {
              // Cache the needed info from the first worker.
              debuggeeId = c.debuggeeId;
              projectId = c.projectId;
            } else {
              // Make sure all other workers are consistent.
              if (debuggeeId !== c.debuggeeId || projectId !== c.projectId) {
                reject(new Error(
                    'Child debuggee ID and/or project ID' +
                    'is not consistent with previous child'));
                return;
              }
            }
            numChildrenReady++;
            if (numChildrenReady === CLUSTER_WORKERS) {
              resolve();
            }
          };

      // Handle stdout/stderr output from a child process. More specifically,
      // write the child process's output to a transcript.
      // Each child has its own transcript.
      const stdoutHandler = (index: number) => {
        return (chunk: string) => {
          children[index].transcript += chunk;
        };
      };

      for (let i = 0; i < CLUSTER_WORKERS; i++) {
        // Fork child processes that sned messages to this process with IPC.
        const child: Child = {transcript: ''};
        child.process = cp.fork(
            FILENAME, /* args */[],
            {execArgv: [], env: process.env, silent: true});
        child.process.on('message', handler);

        children.push(child);

        child.process.stdout.on('data', stdoutHandler(i));
        child.process.stderr.on('data', stdoutHandler(i));
      }
    });
  });

  afterEach(function() {
    this.timeout(5 * 1000);
    // Create a promise for each child that resolves when that child exits.
    const childExitPromises = children.map((child) => {
      console.log(child.transcript);
      assert(child.process);
      const childProcess = child.process as cp.ChildProcess;
      childProcess.kill();
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('A child process failed to exit.'));
        }, 3000);
        childProcess.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    });
    // Wait until all children exit, then reset test state.
    return Promise.all(childExitPromises).then(() => {
      debuggeeId = null;
      projectId = null;
      children = [];
    });
  });

  async function verifyDebuggeeFound() {
    const debuggees = await api.listDebuggees(projectId!, true);

    // Check that the debuggee created in this test is among the list of
    // debuggees, then list its breakpoints
    console.log(
        '-- List of debuggees\n', util.inspect(debuggees, {depth: null}));
    assert.ok(debuggees, 'should get a valid ListDebuggees response');

    const result = debuggees.find(d => d.id === debuggeeId);
    assert.ok(result, 'should find the debuggee we just registered');
  }

  async function verifyDeleteBreakpoints() {
    // Delete every breakpoint
    const breakpoints = await api.listBreakpoints(debuggeeId!, {});
    console.log('-- List of breakpoints\n', breakpoints);

    const promises = breakpoints.map(breakpoint => {
      return api.deleteBreakpoint(debuggeeId!, breakpoint.id);
    });
    await Promise.all(promises);

    const breakpointsAfterDelete = await api.listBreakpoints(debuggeeId!, {});
    assert.strictEqual(breakpointsAfterDelete.length, 0);
    console.log('-- deleted');
  }

  async function verifySetBreakpoint(breakpt: stackdriver.Breakpoint) {
    // Set a breakpoint at which the debugger should write to a log
    const breakpoint = await api.setBreakpoint(debuggeeId!, breakpt);

    // Check that the breakpoint was set, and then wait for the log to be
    // written to
    assert.ok(breakpoint, 'should have set a breakpoint');
    assert.ok(breakpoint.id, 'breakpoint should have an id');
    assert.ok(breakpoint.location, 'breakpoint should have a location');
    assert.strictEqual(breakpoint.location!.path, FILENAME);

    console.log('-- waiting for the breakpoint/logpoint to hit');
    await delay(10 * 1000);

    return breakpoint;
  }

  async function verifySetLogpoint() {
    console.log('-- setting a logpoint');
    await verifySetBreakpoint({
      id: 'breakpoint-1',
      location: {path: FILENAME, line: 5},
      condition: 'n === 10',
      action: 'LOG',
      expressions: ['o'],
      logMessageFormat: LOG_MESSAGE_FORMAT,
      stackFrames: [],
      evaluatedExpressions: [],
      variableTable: []
    });

    // Check the contents of the log, but keep the original breakpoint.
    children.forEach((child, index) => {
      assert(
          child.transcript.indexOf(`${UUID}: o is: {"a":[1,"hi",true]}`) !== -1,
          'transcript in child ' + index +
              ' should contain value of o: ' + child.transcript);
    });
  }

  async function verifySetDuplicateBreakpoint() {
    // Set another breakpoint at the same location
    console.log('-- setting a breakpoint');
    const breakpoint = await verifySetBreakpoint({
      id: 'breakpoint-2',
      location: {path: FILENAME, line: 5},
      expressions: ['process'],  // Process for large variable
      condition: 'n === 10',
      logMessageFormat: LOG_MESSAGE_FORMAT,
      stackFrames: [],
      evaluatedExpressions: [],
      variableTable: []
    });

    console.log('-- now checking if the breakpoint was hit');
    const foundBreakpoint = await api.getBreakpoint(debuggeeId!, breakpoint.id);

    // Check that the breakpoint was hit and contains the correct
    // information, which ends the test
    console.log('-- results of get breakpoint\n', foundBreakpoint);
    assert.ok(foundBreakpoint, 'should have a breakpoint in the response');
    assert.ok(foundBreakpoint.isFinalState, 'breakpoint should have been hit');
    assert.ok(Array.isArray(foundBreakpoint.stackFrames), 'should have stack ');
    const top = foundBreakpoint.stackFrames[0];
    assert.ok(top, 'should have a top entry');
    assert.ok(top.function, 'frame should have a function property');
    assert.strictEqual(top.function, 'fib');

    const arg = top.locals.find(t => t.name === 'n');
    assert.ok(arg, 'should find the n argument');
    assert.strictEqual(arg!.value, '10');
    console.log('-- checking log point was hit again');
    children.forEach((child) => {
      const count = (child.transcript.match(REGEX) || []).length;
      assert.ok(count > 4);
    });

    await api.deleteBreakpoint(debuggeeId!, foundBreakpoint.id);
  }

  async function verifyHitLogpoint() {
    // wait for 60 seconds
    console.log('-- waiting for 60 seconds');
    await delay(60 * 1000);

    // Make sure the log point is continuing to be hit.
    console.log('-- checking log point was hit again');
    children.forEach((child) => {
      const count = (child.transcript.match(REGEX) || []).length;
      assert.ok(count > 60);
    });
    console.log('-- test passed');
  }

  it('should set breakpoints correctly', async function() {
    this.timeout(90 * 1000);
    await verifyDebuggeeFound();
    await verifyDeleteBreakpoints();
    await verifySetLogpoint();
    await verifySetDuplicateBreakpoint();
    await verifyHitLogpoint();
  });

  it('should throttle logs correctly', async function() {
    this.timeout(15 * 1000);

    await verifyDebuggeeFound();

    const breakpoints = await api.listBreakpoints(debuggeeId!, {});
    console.log('-- List of breakpoints\n', breakpoints);

    await verifyDeleteBreakpoints();

    const foundBreakpoints = await api.listBreakpoints(debuggeeId!, {});
    assert.strictEqual(foundBreakpoints.length, 0);
    console.log('-- deleted');

    // Set a breakpoint at which the debugger should write to a log
    console.log('-- setting a logpoint');
    const breakpoint = await verifySetBreakpoint({
      id: 'breakpoint-3',
      location: {path: FILENAME, line: 5},
      condition: 'n === 10',
      action: 'LOG',
      expressions: ['o'],
      logMessageFormat: LOG_MESSAGE_FORMAT,
      stackFrames: [],
      evaluatedExpressions: [],
      variableTable: []
    });

    // If no throttling occurs, we expect ~20 logs since we are logging
    // 2x per second over a 10 second period.
    children.forEach((child) => {
      const logCount = (child.transcript.match(REGEX) || []).length;
      // A log count of greater than 10 indicates that we did not
      // successfully pause when the rate of `maxLogsPerSecond` was
      // reached.
      assert(logCount <= 10, 'log count is greater than 10: ' + logCount);
      // A log count of less than 3 indicates that we did not successfully
      // resume logging after `logDelaySeconds` have passed.
      assert(logCount > 2, 'log count is not greater than 2: ' + logCount);
    });

    await api.deleteBreakpoint(debuggeeId!, breakpoint.id);
    console.log('-- test passed');
  });
});
