/* KEEP THIS CODE AT THE TOP SO THAT THE BREAKPOINT LINE NUMBERS DON'T CHANGE */

'use strict';
function fib(n) {
  if (n < 2) { return n; } var o = { a: [1, 'hi', true] };
  return fib(n - 1, o) + fib(n - 2, o); // adding o to appease linter.
}

/**
 * Copyright 2016 Google Inc. All Rights Reserved.
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

 var debug = require('../..')();
 debug.startAgent();

 // Given the debug agent some time to start and then notify the cluster
 // master.
 setTimeout(function() {
   var ok = true;
   function sendErrorIfNotOk(predicate, errorMessage) {
     if (!predicate) {
       ok = false;
       process.send(errorMessage);
     }
   };
   sendErrorIfNotOk(debug.private_, 'debuglet has initialized');
   var debuglet = debug.private_;
   var debuggee = debuglet.debuggee_;
   sendErrorIfNotOk(debuggee, 'should create debuggee');
   sendErrorIfNotOk(debuggee.project, 'debuggee should have a project');
   sendErrorIfNotOk(debuggee.id, 'debuggee should have registered');
   if (ok) {
     // The parent process needs to know the debuggeeId and project.
     process.send(['', debuggee.id, debuggee.project]);
     setInterval(fib.bind(null, 12), 2000);
   } else {
     setTimeout(function() {
       process.exit(1);
     }, 2000);
   }
 }, 7000);
