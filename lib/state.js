/**
 * Copyright 2014 Google Inc. All Rights Reserved.
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

module.exports = {
  capture: capture,
  evaluate: evaluate
};

var assert = require('assert');
var semver = require('semver');
var util = require('util');

var StatusMessage = require('./apiclasses.js').StatusMessage;

// Error message indices into the resolved variable table.
var BUFFER_FULL_MESSAGE_INDEX = 0;
var NATIVE_PROPERTY_MESSAGE_INDEX = 1;
var GETTER_MESSAGE_INDEX = 2;
var ARG_LOCAL_LIMIT_MESSAGE_INDEX = 3;
var OBJECT_LIMIT_MESSAGE_INDEX = 4;
var STRING_LIMIT_MESSAGE_INDEX = 5;

var MESSAGE_TABLE = [];
MESSAGE_TABLE[BUFFER_FULL_MESSAGE_INDEX] =
  { status: new StatusMessage(StatusMessage.VARIABLE_VALUE,
                              'Max data size reached', true) };
MESSAGE_TABLE[NATIVE_PROPERTY_MESSAGE_INDEX] =
  { status: new StatusMessage(StatusMessage.VARIABLE_VALUE,
                              'Native properties are not available', true) };
MESSAGE_TABLE[GETTER_MESSAGE_INDEX] =
  { status: new StatusMessage(StatusMessage.VARIABLE_VALUE,
                              'Properties with getters are not available', true) };
MESSAGE_TABLE[ARG_LOCAL_LIMIT_MESSAGE_INDEX] =
  { status: new StatusMessage(StatusMessage.VARIABLE_VALUE,
                              'Locals and arguments are only displayed for the ' +
                              'top `config.capture.maxExpandFrames` stack frames.',
                                true) };
MESSAGE_TABLE[OBJECT_LIMIT_MESSAGE_INDEX] =
  { status: new StatusMessage(StatusMessage.VARIABLE_VALUE,
                              'Only first `config.capture.maxProperties` elements' +
                              ' were captured.',
                                false) };
MESSAGE_TABLE[STRING_LIMIT_MESSAGE_INDEX] =
  { status: new StatusMessage(StatusMessage.VARIABLE_VALUE,
                              'Only first `config.capture.maxStringLength` chars' +
                              ' were captured.',
                                false) };

/**
 * Captures the stack and current execution state.
 *
 * @return an object with stackFrames, variableTable, and
 *         evaluatedExpressions fields
 */
function capture(execState, expressions, config) {
  return (new StateResolver(execState, expressions, config)).capture_();
}


/**
 * Checks that the provided expressions will not have side effects and
 * then evaluates the expression in the current execution context.
 *
 * @return an object with error and mirror fields.
 */
function evaluate(expression, frame) {
  // First validate the expression to make sure it doesn't mutate state
  var acorn = require('acorn');
  try {
    var ast = acorn.parse(expression, { sourceType: 'script' });
    var validator = require('./validator');
    if (!validator.isValid(ast)) {
      return { error: 'expression not allowed'};
    }
  } catch (err) {
    return { error: err.message };
  }

  // Now actually ask V8 to evaluate the expression
  try {
    var mirror = frame.evaluate(expression);
    return {
      error: null,
      mirror: mirror
    };
  } catch (error) {
    return {
      error: error
    };
  }
}


/**
 * @param {!Object} execState
 * @param {Array<string>} expressions
 * @param {!Object} config
 * @constructor
 */
function StateResolver(execState, expressions, config) {
  this.state_ = execState;
  this.expressions_ = expressions;
  this.config_ = config;

  this.evaluatedExpressions_ = [];
  this.totalSize_ = 0;

  this.resolvedVariableTable_ = util._extend([], MESSAGE_TABLE);
  this.rawVariableTable_ = MESSAGE_TABLE.map(function() { return null; });
}


/**
 * Captures the stack and current execution state.
 *
 * @return an object with stackFrames, variableTable, and
 *         evaluatedExpressions fields
 */
StateResolver.prototype.capture_ = function() {
  // Gather the stack frames first
  var that = this;
  var frames = that.resolveFrames_();

  // Evaluate the watch expressions
  if (that.expressions_) {
    that.expressions_.forEach(function(expression, index) {
      var result = evaluate(expression, that.state_.frame(0));
      var evaluated;

      if (result.error) {
        evaluated = {
          name: expression,
          status: new StatusMessage(StatusMessage.VARIABLE_VALUE,
                                    result.error, true)
        };
      } else {
        evaluated = that.resolveVariable_(expression, result.mirror);
      }
      that.evaluatedExpressions_[index] = evaluated;
    });
  }

  // Now resolve the variables
  var index = MESSAGE_TABLE.length; // skip the sentinel values
  var noLimit = that.config_.capture.maxDataSize === 0;
  while (index < that.rawVariableTable_.length && // NOTE: length changes in loop
         (that.totalSize_ < that.config_.capture.maxDataSize || noLimit)) {
    assert(!that.resolvedVariableTable_[index]); // shouldn't have it resolved yet
    that.resolvedVariableTable_[index] =
      that.resolveMirror_(that.rawVariableTable_[index]);
    index++;
  }

  // If we filled up the buffer already, we need to trim the remainder
  if (index < that.rawVariableTable_.length) {
    that.trimVariableTable_(index, frames);
  }

  return {
    stackFrames: frames,
    variableTable: that.resolvedVariableTable_,
    evaluatedExpressions: that.evaluatedExpressions_
  };
};

/**
 * Limits the size of the variable table to `fromIndex` elements. It marks
 * all variables with entries beyond `fromIndex` with a message indicating
 * that the table filled.
 *
 * @param {Number} fromIndex The desired size of the variable table.
 * @param {Object} frames Frames associated with the current execution
 *                        environment.
 */
StateResolver.prototype.trimVariableTable_ = function(fromIndex, frames) {
  this.resolvedVariableTable_.splice(fromIndex); // remove the remaining entries

  var processBufferFull = function(variables) {
    variables.forEach(function (variable) {
      if (variable.varTableIndex && variable.varTableIndex >= fromIndex) {
        // make it point to the sentinel 'buffer full' value
        variable.varTableIndex = BUFFER_FULL_MESSAGE_INDEX;
      }
      if (variable.members) {
        processBufferFull(variable.members);
      }
    });
  };

  frames.forEach(function(frame) {
    processBufferFull(frame.arguments);
    processBufferFull(frame.locals);
  });
  processBufferFull(this.evaluatedExpressions_);
  processBufferFull(this.resolvedVariableTable_);
};

StateResolver.prototype.resolveFrames_ = function() {
  var frames = [];
  var frameCount = Math.min(this.state_.frameCount(),
    this.config_.capture.maxFrames);
  for (var i = 0; i < frameCount; i++) {
    var frame = this.state_.frame(i);
    if (this.shouldFrameBeResolved_(frame)) {
      var resolveVars = i < this.config_.capture.maxExpandFrames;
      frames.push(this.resolveFrame_(frame, resolveVars));
    }
  }
  return frames;
};

StateResolver.prototype.shouldFrameBeResolved_ = function(frame) {
  // Only capture data from the frames for which we can link the data back
  // to the source files.

  var fullPath = this.resolveFullPath_(frame);

  if (!this.isPathInCurrentWorkingDirectory_(fullPath)) {
    return false;
  }

  var relativePath = this.resolveRelativePath_(frame);
  if (!this.config_.capture.includeNodeModules &&
      this.isPathInNodeModulesDirectory_(relativePath)) {
    return false;
  }

  return true;
};

StateResolver.prototype.resolveFullPath_ = function(frame) {
  var func = frame.func();
  if (!func.resolved()) {
    return '';
  }

  var script = func.script();
  if (!script) {
    return '';
  }

  return script.name();
};

StateResolver.prototype.resolveRelativePath_ = function(frame) {
  var fullPath = this.resolveFullPath_(frame);
  return this.stripCurrentWorkingDirectory_(fullPath);
};

StateResolver.prototype.stripCurrentWorkingDirectory_ = function(path) {
  // Strip 1 extra character to remove the slash.
  return path.substr(this.config_.workingDirectory.length + 1);
};

StateResolver.prototype.isPathInCurrentWorkingDirectory_ = function(path) {
  //return true;
  return path.indexOf(this.config_.workingDirectory) === 0;
};

StateResolver.prototype.isPathInNodeModulesDirectory_ = function(path) {
  return path.indexOf('node_modules') === 0;
};

StateResolver.prototype.resolveFrame_ = function(frame, resolveVars) {
  var args = resolveVars ? this.resolveArgumentList_(frame) : [{
    name: 'arguments_not_available',
    varTableIndex: ARG_LOCAL_LIMIT_MESSAGE_INDEX
  }];
  var locals = resolveVars ? this.resolveLocalsList_(frame, args) : [{
    name: 'locals_not_available',
    varTableIndex: ARG_LOCAL_LIMIT_MESSAGE_INDEX
  }];
  return {
    function: this.resolveFunctionName_(frame.func()),
    location: this.resolveLocation_(frame),
    arguments: args,
    locals: locals
  };
};

StateResolver.prototype.resolveFunctionName_ = function(func) {
  if (!func || !func.isFunction()) {
    return '';
  }
  return func.name() || func.inferredName() || '(anonymous function)';
};

StateResolver.prototype.resolveLocation_ = function(frame) {
  return {
    path: this.resolveRelativePath_(frame),
    // V8 uses 0-based line numbers but Debuglet API uses 1-based numbers.
    line: frame.sourceLine() + 1
  };
};

StateResolver.prototype.resolveArgumentList_ = function(frame) {
  var args = [];
  for (var i = 0; i < frame.argumentCount(); i++) {
    // Don't resolve unnamed arguments.
    if (!frame.argumentName(i)) {
      continue;
    }
    args.push(this.resolveVariable_(
        frame.argumentName(i), frame.argumentValue(i)));
  }
  return args;
};

StateResolver.prototype.resolveLocalsList_ = function(frame,
    resolvedArguments) {
  var locals = [];
  // Arguments may have been captured as locals in a nested closure.
  // We filter them out here.
  var predicate = function(localEntry, argEntry) {
    return argEntry.varTableIndex === localEntry.varTableIndex;
  };
  for (var i = 0; i < frame.localCount(); i++) {
    var localEntry = this.resolveVariable_(
        frame.localName(i), frame.localValue(i));
    if (!resolvedArguments.some(predicate.bind(null, localEntry))) {
      locals.push(this.resolveVariable_(
        frame.localName(i), frame.localValue(i)));
    }
  }
  return locals;
};

/**
 * Computes a text representation of the provided value based on its type.
 * If the value is a recursive data type, it will be represented as an index
 * into the variable table.
 *
 * @param {String} name The name of the variable.
 * @param {Object} value A v8 debugger representation of a variable value.
 */
StateResolver.prototype.resolveVariable_ = function(name, value) {
  var size = name.length;

  var data = {
    name: name
  };

  if (value.isPrimitive() || value.isRegExp()) {
    // primitives: undefined, null, boolean, number, string, symbol
    data.value = value.toText();
    var maxLength = this.config_.capture.maxStringLength;
    if (maxLength && maxLength < data.value.length) {
      data.value = data.value.substring(0, maxLength) + '...';
      data.status = MESSAGE_TABLE[STRING_LIMIT_MESSAGE_INDEX].status;
    }

  } else if (value.isFunction()) {
    data.value = 'function ' + this.resolveFunctionName_(value) + '()';

  } else if (value.isObject()) {
    data.varTableIndex = this.getVariableIndex_(value);
    var maxProps = this.config_.capture.maxProperties;
    if (maxProps && maxProps < Object.keys(value.value()).length) {
      data.status = MESSAGE_TABLE[OBJECT_LIMIT_MESSAGE_INDEX].status;
    }

  } else {
    // PropertyMirror, InternalPropertyMirror, FrameMirror, ScriptMirror
    data.value = 'unknown mirror type';
  }

  if (data.value) {
    size += data.value.length;
  } else {
    size += 8; // fudge-it
  }

  this.totalSize_ += size;

  return data;
};

StateResolver.prototype.getVariableIndex_ = function(value) {
  var idx = this.rawVariableTable_.indexOf(value);
  if (idx === -1) {
    idx = this.storeObjectToVariableTable_(value);
  }
  return idx;
};

StateResolver.prototype.storeObjectToVariableTable_ = function(obj) {
  var idx = this.rawVariableTable_.length;
  this.rawVariableTable_[idx] = obj;
  return idx;
};

/**
 * Responsible for recursively resolving the properties on a
 * provided object mirror. Due to a bug in early node versions,
 * we maintain two implementations using the fast approach
 * for supported node versions.
 *
 * See https://github.com/iojs/io.js/issues/1190.
 */
StateResolver.prototype.resolveMirror_ = function(mirror) {
  if (semver.satisfies(process.version, '<1.6')) {
    return this.resolveMirrorSlow_(mirror);
  } else {
    return this.resolveMirrorFast_(mirror);
  }
};

// A slower implementation of resolveMirror_ which is safe for all node versions
StateResolver.prototype.resolveMirrorSlow_ = function(mirror) {
  // Instead, let's use Object.keys. This will only get the enumerable
  // properties. The other alternative would be Object.getOwnPropertyNames, but
  // I'm going with the former as that's what util.inspect does.
  var that = this;
  var keys = Object.keys(mirror.value());
  if (that.config_.capture.maxProperties) {
    keys = keys.slice(0, that.config_.capture.maxProperties);
  }
  var members = keys.map(function(prop) {
    return that.resolveMirrorProperty_(mirror.property(prop));
  });

  return {
    value: mirror.toText(),
    members: members
  };
};

// A faster implementation of resolveMirror_ which segfaults in node <1.6
//
// See https://github.com/iojs/io.js/issues/1190.
StateResolver.prototype.resolveMirrorFast_ = function(mirror) {
  var members = this.getMirrorProperties_(mirror).map(
      this.resolveMirrorProperty_.bind(this));
  return {
    value: mirror.toText(),
    members: members
  };
};

StateResolver.prototype.getMirrorProperties_ = function(mirror) {
  var numProperties = this.config_.capture.maxProperties;
  var properties = mirror.properties();
  return numProperties ? properties.slice(0, numProperties) : properties;
};

StateResolver.prototype.resolveMirrorProperty_ = function(property) {
  var name = String(property.name());
  if (property.isNative()) {
    return {
      name: name,
      varTableIndex: NATIVE_PROPERTY_MESSAGE_INDEX
    };
  }
  if (property.hasGetter()) {
    return {
      name: name,
      varTableIndex: GETTER_MESSAGE_INDEX
    };
  }
  return this.resolveVariable_(name, property.value());
};
