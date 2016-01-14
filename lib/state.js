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

var StatusMessage = require('./apiclasses.js').StatusMessage;

var BUFFER_FULL_MESSAGE_INDEX = 0;
var NATIVE_PROPERTY_MESSAGE_INDEX = 1;
var GETTER_MESSAGE_INDEX = 2;

// TODO: document this file

// returns an object with three fields: stacksframes,
// variableTable and evaluated_expressions
function capture(execState, expressions, config) {
  return (new StateResolver(execState, expressions, config)).capture();
}

/**
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

  this.rawVariableTable_ = [ null, null, null ];
  this.resolvedVariableTable_ = [];
  this.resolvedVariableTable_[BUFFER_FULL_MESSAGE_INDEX] =
    { status: new StatusMessage(StatusMessage.VARIABLE_VALUE,
                                'Max data size reached', true) };
  this.resolvedVariableTable_[NATIVE_PROPERTY_MESSAGE_INDEX] =
    { status: new StatusMessage(StatusMessage.VARIABLE_VALUE,
                                'Native properties are not available', true) };
  this.resolvedVariableTable_[GETTER_MESSAGE_INDEX] =
    { status: new StatusMessage(StatusMessage.VARIABLE_VALUE,
                                'Properties with getters are not available', true) };
}


StateResolver.prototype.capture = function() {
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
  var index = 3; // skip the sentinel values
  while (index < that.rawVariableTable_.length && // NOTE: length changes in loop
         that.totalSize_ < that.config_.capture.maxDataSize) {
    assert(!that.resolvedVariableTable_[index]); // shouldn't have it resolved yet
    that.resolvedVariableTable_[index] =
      that.resolveMirror_(that.rawVariableTable_[index]);
    index++;
  }

  // console.log('totalSize: ' + that.totalSize_ + ' index: ' + index + ' table: '+
  //   that.rawVariableTable_.length);

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
  // TODO(ofrobots): only gather variables for top n frames (python: 5)
  // TODO(ofrobots): Do not gather the full stack trace (python: 20)

  var frames = [];
  for (var i = 0; i < this.state_.frameCount(); i++) {
    var frame = this.state_.frame(i);
    if (this.shouldFrameBeResolved_(frame)) {
      frames.push(this.resolveFrame_(frame));
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


StateResolver.prototype.resolveFrame_ = function(frame) {
  var args = this.resolveArgumentList_(frame);
  return {
    function: this.resolveFunctionName_(frame.func()),
    location: this.resolveLocation_(frame),
    arguments: args,
    locals: this.resolveLocalsList_(frame, args)
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


StateResolver.prototype.resolveVariable_ = function(name, value) {
  var size = name.length;

  var data = {
    name: name
  };

  if (value.isPrimitive() || value.isRegExp()) {
    // primitives: undefined, null, boolean, number, string, symbol
    data.value = value.toText();

  } else if (value.isFunction()) {
    data.value = 'function ' + this.resolveFunctionName_(value) + '()';

  } else if (value.isObject()) {
    data.varTableIndex = this.getVariableIndex_(value);

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

StateResolver.prototype.resolveMirror_ = function(mirror) {
  if (semver.satisfies(process.version, '<1.6')) {
    return this.resolveMirrorSlow_(mirror);
  } else {
    return this.resolveMirrorFast_(mirror);
  }
};

// A slower implementation of resolveMirror_ which is safe for all node versions
//
// See https://github.com/iojs/io.js/issues/1190.
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
  var namedProperties = mirror.properties(1, numProperties);
  var indexedProperties = mirror.properties(2, numProperties);
  return namedProperties.concat(indexedProperties);
};
StateResolver.prototype.resolveMirrorProperty_ = function(property) {
  if (property.isNative()) {
    return {
      name: property.name(),
      varTableIndex: NATIVE_PROPERTY_MESSAGE_INDEX
    };
  }
  if (property.hasGetter()) {
    return {
      name: property.name(),
      varTableIndex: GETTER_MESSAGE_INDEX
    };
  }
  return this.resolveVariable_(property.name(), property.value());
};
