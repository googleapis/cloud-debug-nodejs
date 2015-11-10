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

//var util = require('util');
var assert = require('assert');

var StatusMessage = require('./apiclasses.js').StatusMessage;

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
  // TODO: it would be really nice if V8 gave us an API for this
  // so that we don't have to include an external parser
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

  // The 0-th object in the variable table is a sentinel 'buffer full' error
  // message value
  this.rawVariableTable_ = [ null ];
  this.resolvedVariableTable_ = [
    { status: new StatusMessage(StatusMessage.VARIABLE_VALUE,
                                'Buffer full', true) }
  ];
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
  var index = 1; // skip the sentinel value
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
        variable.varTableIndex = 0;
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
  return {
    function: this.resolveFunctionName_(frame.func()),
    location: this.resolveLocation_(frame),
    arguments: this.resolveArgumentList_(frame),
    locals: this.resolveLocalsList_(frame)
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


StateResolver.prototype.resolveLocalsList_ = function(frame) {
  var locals = [];
  for (var i = 0; i < frame.localCount(); i++) {
    locals.push(this.resolveVariable_(
        frame.localName(i), frame.localValue(i)));
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
  // TODO(ofrobots): Once V8 de-optimization issue is fixed, come back and
  // re-evaluate this method. The naïve indexOf scan be sped up by monkey
  // patching the value mirror object with an index. Not sure if it is
  // significantly faster to be worth doing at this point.
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
  // See the commented out version of this method below.
  //
  // Instead, let's use Object.keys. This will only get the enumerable
  // properties. The other alternative would be Object.getOwnPropertyNames, but
  // I'm going with the former as that's what util.inspect does.
  var that = this;
  var keys = Object.keys(mirror.value());
  if (that.config_.capture.maxProperties) {
    keys = keys.slice(0, that.config_.capture.maxProperties);
  }
  var members = keys.map(function(prop) {
    return that.resolveVariable_(prop, mirror.property(prop).value());
  });

  return {
    value: mirror.toText(),
    members: members
  };
};

// Ideally we would use Mirror.properties() method to acquire the properties
// However, because of a bug that exists in iojs (uptil 1.6.?) and node (still)
// we can end up with segfaults on objects with interceptors and accessors.
// See https://github.com/iojs/io.js/issues/1190.
//
// StateResolver.prototype.resolveMirror_ = function(mirror) {
//   var members = this.getMirrorProperties_(mirror).map(
//       this.resolveMirrorProperty_.bind(this));
//   return {
//     value: mirror.toText(),
//     members: members
//   };
// };
// StateResolver.prototype.getMirrorProperties_ = function(mirror) {
//   var namedProperties = mirror.properties(1, 100); // Limited to 100.
//   var indexedProperties = mirror.properties(2, 100); // Limited to 100.
//   return namedProperties.concat(indexedProperties);
// };
// StateResolver.prototype.resolveMirrorProperty_ = function(property) {
//   return this.resolveVariable_(property.name(), property.value());
// };
