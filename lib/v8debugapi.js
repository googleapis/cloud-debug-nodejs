/**
 * Copyright 2014, 2015 Google Inc. All Rights Reserved.
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

'use strict';

var vm = require('vm');
var path = require('path');
//var util = require('util');

var events = require('events');
var state = require('./state.js');
var Logger = require('./logger.js');
var apiclasses = require('./apiclasses.js');
var StatusMessage = apiclasses.StatusMessage;

var v8 = null;
var logger = null;
var config = null;
var emitter = null;
var breakpoints = {};
var listeners = {};
var numBreakpoints = 0;

var messages = {
  INVALID_BREAKPOINT: 'invalid breakpoint - id or location missing',
  BREAKPOINT_ONLY_SUPPORTS_JAVASCRIPT: 'Only files with .js extensions are supported',
  SOURCE_FILE_NOT_FOUND: 'A script matching the source file was not found loaded on the debuggee',
  SOURCE_FILE_AMBIGUOUS: 'Multiple files match the path specified',
  V8_BREAKPOINT_ERROR: 'Unable to set breakpoint in v8',
  SYNTAX_ERROR_IN_CONDITION: 'Syntax error in condition: ',
  DISALLOWED_EXPRESSION: 'Expression not allowed',
  SOURCE_MAP_URL_NOT_FOUND: 'The source map url could not be found in the compiled file',
  SOURCE_MAP_READ_ERROR: 'The source map could not be read or was incorrectly formatted'
};

module.exports = {
  init: init,
  set: set,
  clear: clear,
  wait: wait,
  // The following are for testing:
  messages: messages,
  numBreakpoints_: function() { return Object.keys(breakpoints).length; },
  numListeners_: function()   { return Object.keys(listeners).length; }
};

function init(logger_, config_) {
  // Node.js v0.11 adds the runInDebugContext method that can be used to fetch
  // the API object.
  if (vm.runInDebugContext) {
    v8 = vm.runInDebugContext('Debug');

  // Older versions of Node.js should be run with the
  // --expose_debug_as=v8debug flag.
  } else if (global.v8debug) {
    v8 = global.v8debug.Debug;
  } else {
    return false;
  }

  logger = logger_;
  config = config_;
  emitter = new events.EventEmitter();
  emitter.setMaxListeners(0);

  return true;
}

function endsWith(str, suffix) {
  if (typeof String.prototype.endsWith === 'function') {
    return str.endsWith(suffix);
  } else {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
  }
}

/**
 * @param {!Breakpoint} breakpoint Debug API Breakpoint object
 * @return {boolean} false if unable to set breakpoint. breakpoint.status
 *     is updated with an error message appropriately in such a case
 */
function set(breakpoint) {
  if (!v8 ||
      !breakpoint ||
      typeof breakpoint.id === 'undefined' || // 0 is a valid id
      !breakpoint.location ||
      !breakpoint.location.path ||
      !breakpoint.location.line) {
    if (breakpoint) {
      breakpoint.status =
        new StatusMessage(StatusMessage.UNSPECIFIED,
                          messages.INVALID_BREAKPOINT, true);
    }
    return false;
  }

  var scriptPath = path.normalize(breakpoint.location.path);
  var compile = null;

  if (!endsWith(scriptPath, '.js')) {
    var sm = require('source-map');
    var fs = require('fs');
    var sourcePos = {
      source: scriptPath.indexOf('/') === -1 ? scriptPath
        : scriptPath.split('/').pop(),
      line: breakpoint.location.line,
      column: 0
    };
    compile = getBreakpointCompiler(breakpoint);
    if (breakpoint.condition && compile) {
      breakpoint.condition = compile(breakpoint.condition);
    }
    // TODO: more robust file finding of compiled files
    scriptPath = scriptPath.substr(0, scriptPath.lastIndexOf('.')) + '.js';
    var mappingUrl = scriptPath + '.map';
    // TODO: make this async
    var map = fs.readFileSync(path.normalize(mappingUrl.trim()), 'utf8');
    try {
      var mappedPos = (new sm.SourceMapConsumer(map)).generatedPositionFor(sourcePos);
      breakpoint.location.path = scriptPath;
      breakpoint.location.line = mappedPos.line;
    } catch (err) {
      breakpoint.status =
          new StatusMessage(StatusMessage.BREAKPOINT_CONDITION,
                            messages.SOURCE_MAP_READ_ERROR, true);
      return false;
    }
  }

  // Parse and validate conditions and watch expressions for correctness and
  // immutability
  // TODO: make it an option for users to disable validation
  var ast = null;
  if (breakpoint.condition) {
    var acorn = require('acorn');
    try {
      ast = acorn.parse(breakpoint.condition);
      var validator = require('./validator.js');
      if (!validator.isValid(ast)) {
        breakpoint.status =
          new StatusMessage(StatusMessage.BREAKPOINT_CONDITION,
                            messages.DISALLOWED_EXPRESSION, true);
        return false;
      }
    } catch (err) {
      breakpoint.status =
        new StatusMessage(StatusMessage.BREAKPOINT_CONDITION,
                          messages.SYNTAX_ERROR_IN_CONDITION + err.message,
                          true);
      return false;
    }
  }

  // Presently it is not possible to precisely disambiguate the script
  // path from the path provided by the debug server. The issue is that we
  // don't know the repository root relative to the root filesystem or relative
  // to the working-directory of the process. We want to make sure that we are
  // setting the breakpoint that the user intended instead of a breakpoint
  // in a file that happens to have the same name but is in a different
  // directory. Until this is addressed between the server and the debuglet,
  // we are going to assume that repository root === the starting working
  // directory.
  var scripts = findScripts(scriptPath);
  if (scripts.length === 0) {
    // It is possible the file exists but isn't loaded yet. TODO
    breakpoint.status =
      new StatusMessage(StatusMessage.BREAKPOINT_SOURCE_LOCATION,
                        messages.SOURCE_FILE_NOT_FOUND, true);
    return false;
  } else if (scripts.length === 1) {
    // Found the script
    /* nothing more to do */
  } else {
    // More than 1 file matches. Which one is the right one?
    // Try a heuristic. Assume that the paths are relative to the working
    // directory.
    var matched = false;
    var guess = path.join(config.workingDirectory, scriptPath);
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].name === guess) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      // It is possible the file exists but isn't loaded yet. TODO
      breakpoint.status =
        new StatusMessage(StatusMessage.BREAKPOINT_SOURCE_LOCATION,
                          messages.SOURCE_FILE_AMBIGUOUS, true);
      return false;
    } else {
      // Found the script
      scriptPath = guess;
    }
  }
  // TODO: need to cleanup the above
  // TODO: need test coverage for the above
  // TODO: work with debug server to come up with a more robust solution

  var v8bp = setByRegExp(scriptPath, breakpoint.location.line);
  if (!v8bp) {
    breakpoint.status =
     new StatusMessage(StatusMessage.BREAKPOINT_SOURCE_LOCATION,
                       messages.V8_BREAKPOINT_ERROR, true);
    return false;
  }

  if (numBreakpoints === 0) {
    // added first breakpoint
    logger.info('activating v8 breakpoint listener');
    v8.setListener(handleDebugEvents);
  }

  breakpoints[breakpoint.id] = new BreakpointData(breakpoint, v8bp, ast, compile);
  numBreakpoints++;
  return true; // success
}

/**
 * Produces a compilation function based on the file extension of the
 * script path in which the breakpoint is set.
 *
 * @param {Breakpoint} breakpoint
 */
function getBreakpointCompiler(breakpoint) {
  switch(path.normalize(breakpoint.location.path).split('.').pop()) {
    case 'coffee':
      return function(uncompiled) {
        try {
          var comp = require('coffee-script');
          var compiled = comp.compile('0 || (' + uncompiled + ')');
          // Strip out coffeescript scoping wrapper to get translated condition
          var re = /\(function\(\) {\s*0 \|\| \((.*)\);\n\n\}\)\.call\(this\);/;
          var match = re.exec(compiled)[1];
          return match ? match.trim() : match;
        } catch (err) {
          logger.info('Unable to compile break or watch point >> ' +
            uncompiled + ' <<', err);
        }
      };
  }
  return null;
}

/**
 * @param {!string} scriptPath path of a script
 */
function pathToRegExp(scriptPath) {
  // make sure the script path starts with a slash. This makes sure our
  // regexp doesn't match monkey.js when the user asks to set a breakpoint
  // in key.js
  scriptPath = path.join('/', scriptPath);
  return new RegExp(scriptPath + '$');
}

function setByRegExp(scriptPath, line) {
  var regexp = pathToRegExp(scriptPath);
  var num = v8.setScriptBreakPointByRegExp(regexp, line - 1, 0, null);
  var v8bp = v8.findBreakPoint(num);
  return v8bp;
}

// function setById(scriptPath, line) {
//   var script = findScript(scriptPath);
//   if (!script) {
//     return null;
//   }

//   // v8 uses 0-based line numbers                     ----v
//   var position = v8.findScriptSourcePosition(script, line - 1, 0);
//   if (!position) {
//     return null;
//   }

//   var v8bp = v8.setBreakPointByScriptIdAndPosition(
//     script.id, position, null /* condition */, true /*enabled*/
//   );
//   if (!v8bp) {
//     return null;
//   }

//   return v8bp;
// }

function findScripts(scriptPath) {
  var regexp = pathToRegExp(scriptPath);
  var matches = v8.scripts().filter(function(script) {
    return regexp.test(script.name);
  });
  return matches;
}

function clear(breakpoint) {
  if (typeof breakpoint.id === 'undefined') {
    return false;
  }
  var breakpointData = breakpoints[breakpoint.id];
  if (!breakpointData) {
    return false;
  }
  var v8bp = breakpointData.v8Breakpoint;

  v8.clearBreakPoint(v8bp.number());
  delete breakpoints[breakpoint.id];
  delete listeners[breakpoint.id];
  numBreakpoints--;
  if (numBreakpoints === 0) {
    // removed last breakpoint
    logger.info('deactivating v8 breakpoint listener');
    v8.setListener(null);
  }
  return true;
}

/**
 * @param {Breakpoint} breakpoint
 * @param {Function} callback
 */
function wait(breakpoint, callback) {
  var eventName = 'v8breakpoint-' + breakpoints[breakpoint.id].v8Breakpoint
                                                              .number();
  var listener = onBreakpointHit.bind(
      null, breakpoint, function(err) {
        emitter.removeListener(eventName, listener);
        delete listeners[breakpoint.id];
        callback(err);
      });

  listeners[breakpoint.id] = listener;
  emitter.on(eventName, listener);
}

function onBreakpointHit(breakpoint, callback, execState) {
  var v8bp = breakpoints[breakpoint.id].v8Breakpoint;
  if (!v8bp) {
    // TODO: is this ever possible. Change to an assertion.
    var err = new Error('no breakpoint instance to check.');
    callback(err);
    return;
  }

  if (!v8bp.active()) {
    // Breakpoint exists, but not active. Wait for the next breakpoint to hit
    // TODO(ofrobots): This should never happen in the debuglet. We never
    // disable breakpoints. Confirm.
    logger.info('\tbreakpoint not active');
    return;
  }

  if (!isBreakpointConditionMet(breakpoint, execState)) {
    // Check again next time
    logger.info('\tthe breakpoint condition wasn\'t met');
    return;
  }

  // Breakpoint Hit
  var start = process.hrtime();
  try {
    captureBreakpointData(breakpoint, execState);
  } catch (err) {
    callback(err);
    return;
  }
  var end = process.hrtime(start);
  logger.interval(Logger.INFO, 'capture time', end);
  callback(null);
}

/**
 * @param {Debug.DebugEvent} evt
 * @param {TODO} execState
 * @param {Debug.BreakEvent} eventData
 */
function handleDebugEvents(evt, execState, eventData) {
  // NOTE: amount of processing here should be minimal to ensure we have minimal
  // overhead to the execution of the application
  //
  switch (evt) {
    case v8.DebugEvent.Break:
      eventData.breakPointsHit().forEach(function(hit) {
        var num = hit.script_break_point().number();
        logger.info('>>>V8 breakpoint hit<<< number: ' + num);
        var eventName = 'v8breakpoint-' + num;
        emitter.emit(eventName, execState, eventData);
      });
      break;
  }
}

function captureBreakpointData(breakpoint, execState) {
  try {
    if (breakpoint.expressions && breakpoints[breakpoint.id].compile) {
      for (var i = 0; i < breakpoint.expressions.length; i++) {
        breakpoint.expressions[i] =
          breakpoints[breakpoint.id].compile(breakpoint.expressions[i]);
      }
    }
    var captured = state.capture(execState, breakpoint.expressions, config);
    breakpoint.stackFrames = captured.stackFrames;
    breakpoint.variableTable = captured.variableTable;
    breakpoint.evaluatedExpressions = captured.evaluatedExpressions;
  } catch (err) {
    // TODO(ofrobots): we should disable the breakpoint in this scenario
    logger.error('Error capturing state', err);
  }

  //var size = Buffer.byteLength(JSON.stringify(breakpoint), 'utf8');
  //console.log('--$$-- state captured buffer: '+ size + 'bytes');
}

function isBreakpointConditionMet(breakpoint, execState) {
  if (!breakpoint.condition) {
    return true;
  }

  // TODO: we already parsed breakpoint.condition before -- pass it somehow
  var result = state.evaluate(breakpoint.condition, execState.frame(0));

  if (result.error) {
    return false;
  }
  return !!(result.mirror.value()); // intentional !! to force it to a boolean
}

/**
 * @constructor
 */
function BreakpointData(apiBreakpoint, v8Breakpoint, parsedCondition, compile) {
  this.apiBreakpoint = apiBreakpoint;
  this.v8Breakpoint = v8Breakpoint;
  this.parsedCondition = parsedCondition;
  this.compile = compile;
}
