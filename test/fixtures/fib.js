/* KEEP THIS CODE AT THE TOP SO THAT THE BREAKPOINT LINE NUMBERS DON'T CHANGE */
'use strict';
function fib(n) {
  if (n < 2) { return n; } var o = { a: [1, 'hi', true] };
  return fib(n - 1, o) + fib(n - 2, o); // adding o to appease linter.
}

// Copyright 2016 Google LLC
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

const uuid = require('uuid');
// eslint-disable-next-line node/no-missing-require
const nocks = require('../nocks.js');
nocks.projectId('fake-project-id');
// mock the metadata instance to uniformly make this look like a non-gcp
// environment.
nocks.metadataInstance();

const UUID = process.argv[2] || uuid.v4();

console.log('UUID: ', UUID);

// eslint-disable-next-line node/no-missing-require
const debuglet = require('../../..').start({
  debug: {
    logLevel: 2,
    log: {
      maxLogsPerSecond: 2,
      logDelaySeconds: 5,
      // Use a custom logpoint function that converts everything lower case.
      logFunction: message => {
        console.log(message.toLowerCase());
      },
    },
    breakpointUpdateIntervalSec: 1,
    testMode_: true,
    allowExpressions: true,
    description: UUID,
  },
});

// Make troubleshooting easier if run by itself
if (!process.send) {
  process.send = console.log;
}

let timedOut = false;
const registrationTimeout = setTimeout(() => {
  timedOut = true;
  process.send({error: "debuggee didn't register in time"});
  setTimeout(() => {
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  }, 2000);
}, 5000);

debuglet.once('registered', () => {
  if (timedOut) {
    return;
  }
  clearTimeout(registrationTimeout);

  let errorMessage;
  function setErrorIfNotOk(predicate, message) {
    if (!errorMessage && !predicate) {
      errorMessage = message;
    }
  }

  const debuggee = debuglet.debuggee;
  setErrorIfNotOk(debuggee, 'should create debuggee');
  setErrorIfNotOk(debuggee.project, 'debuggee should have a project');
  setErrorIfNotOk(debuggee.id, 'debuggee should have registered');
  if (!errorMessage) {
    // The parent process needs to know the debuggee and project IDs.
    process.send({debuggeeId: debuggee.id, projectId: debuggee.project});
    setInterval(fib.bind(null, 12), 2000);
  } else {
    process.send({error: errorMessage});
    setTimeout(() => {
      // eslint-disable-next-line no-process-exit
      process.exit(1);
    }, 2000);
  }
});
