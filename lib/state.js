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
var lodash = require('lodash');
var isPlainObject = lodash.isPlainObject;
var isFunction = lodash.isFunction;
var isObject = lodash.isObject;
var isArray = lodash.isArray;
var has = lodash.has;
var isNull = lodash.isNull;
var isString = lodash.isString;
var isNumber = lodash.isNumber;
var isUndefined = lodash.isUndefined;
var isBoolean = lodash.isBoolean;
var keys = lodash.keys;

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
 * The variable object is a rendering of an observed variable into an plain
 * Javascript object with three properties which are consumed by the StackDriver
 * API. This object must be used for any variable parsing which is sent to the
 * StackDriver Debug API.
 * @typedef {Object} APIVariable
 * @property {String} name - the variables name
 * @property {Any} value - the varaibles value
 * @property {String} type - the variables type e.g: "String", "Object",
 *  "Array", "Null", "Number"
 */

/**
 * The scoped variable pool is a plain Javascript object that is used to track
 * the relationship between a variable name and its value during the walking of
 * each frames scoped variables. Since the scope topology is flattened for user
 * viewing in the debug inspector this object should not contain scope->variable
 * name->value topology, any duplicate variable names should either be ignored
 * or overwrite the current variable name key inside of the pool. Each key in
 * the pool should reflect an actual variables name and each value should be
 * variables value.
 * @typedef {Object} VariablePool
 * @property {APIVariable} aVariableName - a dynamically allocated property
 *  (note: aVariableName should be replaced with the actual variable name)
 *  where the key is the variable name and the value is variable value as
 *  represented by an instance of the APIVariable object type.
 */


/**
 * @param {!Object} execState
 * @param {Array<string>} expressions
 * @param {!Object} config
 * @class StateResolver
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
  var scopeVars = [];;
  var resolveVars = false;
  var frameResolution = {};
  var frameCount = Math.min(this.state_.frameCount(),
    this.config_.capture.maxFrames);
  for (var i = 0; i < frameCount; i++) {

    var frame = this.state_.frame(i);
    if (this.shouldFrameBeResolved_(frame)) {
      scopeVars = this.extractScopeVars_(frame);
      resolveVars = i < this.config_.capture.maxExpandFrames;
      frameResolution = this.resolveFrame_(frame, resolveVars)
      frameResolution.locals = frameResolution.locals.concat(scopeVars);
      frames.push(frameResolution);
    }
  }
  return frames;
};

/**
 * Extracts variables from the frames scope enumeration. Will also attempt to
 * gather the `context` varaible from the current scope by looking at the
 * receiver object. Will return an array containing relevant scope variables.
 * @function extractScopeVars_
 * @memberof StateResolver
 * @param {FrameMirror} frame - a frame mirror object from the V8 debug API
 * @returns {Array<APIVariable>} - returns an array of APIVariable object
 *  instances for consumption by the StackDriver Debug API 
 */
StateResolver.prototype.extractScopeVars_ = function (frame) {
  var scopes = frame.allScopes();
  var scopedLocals = {};
  var ctx =  this.marshalExtractedVarIntoAPIObject_(frame.details().receiver(),
    "context", []);

  // Attempt to extract the `this` context

  if ( ctx.type === 'object' ) {
    this.fuseScopedVarsToPool(
      ctx
      , scopedLocals
    );
  }

  for (var i = 0; i < scopes.length; i++) {

    switch (scopes[i].scopeType()) {
      case 2: // WITH
      case 4: // TRY/CATCH
      case 5: // BLOCK
      case 7: // EVAL
        this.fuseScopedVarsToPool(
          this.extractFromScopeDetails_(scopes[i]), scopedLocals);
        break;
      default:
        break;
    }
  }

  return this.scopedPoolToList_(scopedLocals);
}

/**
 * Adds variables to the scoped variable pool, which should be enumerated into
 * a list for consumption by the Debug API. This function assumes that first
 * frame parsed is root node on context tree, therefore if a scoped variable by
 * name `x` is accumulated on the first frame pass and the second frame pass
 * renders another varaible named `x` then the initial pass with that observed
 * value will take precedence over the second frame pass and will not be
 * overwritten by the second frames value. This function can accept either a
 * list of scope variable renders or a singular scope variable render. This
 * function will mutate the given scopedLocals varaible.
 * @function fuseScopedVarsToPool
 * @memberof StateResolver
 * @param {APIVariable|Array<APIVariable>} scopeVars - the variable capture(s)
 *  to add to the variable pool
 * @param {VariablePool} scopedLocals - the variable pool accumulated so far
 * @returns {Undefined} - does not return anything
 */
StateResolver.prototype.fuseScopedVarsToPool = function (scopeVars, scopedLocals) {
  if (isArray(scopeVars)) {
    for (var i = 0; i < scopeVars.length; i++) {
      if (isObject(scopeVars[i]) && !has(scopedLocals, scopeVars[i].name)) {
        // the lowest scope is first on the list, do not overwrite
        scopedLocals[scopeVars[i].name] = scopeVars[i];
      }
    }
  } else if (isPlainObject(scopeVars) && !has(scopedLocals, scopeVars.name)) {
    if (!has(scopedLocals, scopeVars.name)) {
      // the lowest scope is first on the list, do not overwrite
      scopedLocals[scopeVars.name] = scopeVars;
    }
  }
  // otherwise an input we can't deal with, defer mutating scopedLocals
}

/**
 * Walks the scoped pools outer key and compiles it into a contiguous array
 * without enforced concern for variable order since the scope topology is
 * flattened for user viewing.
 * @function scopedPoolToList_
 * @memberof StateResolver
 * @param {VariablePool} scopedLocals - the variable pool accumulated so far
 * @returns {Array<APIVariable>} - returns an array of APIVariable instances
 */
StateResolver.prototype.scopedPoolToList_ = function (scopedLocals) {
  var oKeys = keys(scopedLocals);
  var returnArray = new Array(oKeys.length);

  for ( var i = 0; i < oKeys.length; i++ ) {
    returnArray[i] = scopedLocals[oKeys[i]];
  }

  return returnArray;
}

/**
 * Iterates over the scope details object, creates an array and marshals in any
 * extracted variables which should be instance of APIVariable and then returns
 * this array.
 * @function extractFromScopeDetails_
 * @memberof StateResolver
 * @param {ScopeMirror} scope - the ScopeMirror object from the FrameMirror
 *  instance
 * @returns {Array<APIVariable>} - returns an array of APIVariable instances
 *  which were gathered by traversing the scope variables from the given frame
 */
StateResolver.prototype.extractFromScopeDetails_ = function (scope) {

  var targetDetail = scope.details().object();
  var oKeys = keys(targetDetail);
  var extractedVars = [];

  for ( var i = 0; i < oKeys.length; i++ ) {

    extractedVars.push(
      this.marshalExtractedVarIntoAPIObject_(targetDetail[oKeys[i]], oKeys[i],
        [])
    );
  }

  return extractedVars;
}

/**
 * Attempts to determine the type of the variable that is being given for value
 * extraction. If the type is found and supported then the given variable will
 * be routed to the appropriate extraction function and the value returned to
 * the extraction loop. Otherwise undefined will be returned and a warning
 * logged.
 * @function marshalExtractedVarIntoAPIObject_
 * @memberof StateResolver
 * @param {Any} scopeVar - the variable value to be extracted
 * @param {String} varName - the name of the variable value to be extracted
 * @param {Array<Object>|Undefined} [knownRefs] - a list of already known object
 *  references, this parameter is used in recusrive calling of this function for
 *  objects and arrays to avoid attempting to parse circular and/or nested-
 *  circular objects
 * @returns {APIVariable|Undefined} - will either return an instance of
 *  APIVariable with extracted variable information or `Undefined` is the type
 *  cannot be found or is not supported
 */
StateResolver.prototype.marshalExtractedVarIntoAPIObject_ = function (scopeVar, varName, knownRefs) {

  switch (true) {
    case isNumber(scopeVar):
      return this.marshalNumberIntoAPIObject_(scopeVar, varName);
    case isString(scopeVar):
      return this.marshalStringIntoAPIObject_(scopeVar, varName);
    case isBoolean(scopeVar):
      return this.marshalBooleanIntoAPIObject_(scopeVar, varName);
    case isUndefined(scopeVar):
      return this.marshalUndefinedIntoAPIObject_(scopeVar, varName);
    case isNull(scopeVar):
      return this.marshalNullIntoAPIObject_(scopeVar, varName);
    case isFunction(scopeVar):
      return this.marshalFunctionIntoAPIObject_(scopeVar, varName);
    case isArray(scopeVar):
      return this.marshalArrayIntoAPIObject_(scopeVar, varName, knownRefs);
    case isObject(scopeVar):
      return this.marshalObjectIntoAPIObject_(scopeVar, varName, knownRefs);
    default:
      console.log("Unsupported type", typeof scopeVar);
      return;
  }
}

/**
 * Given an object reference to check for and an array of references to check
 * in - will return a boolean indicating whether or not the reference is present
 * in the given array.
 * @function checkForKnownRef_
 * @memberof StateResolver
 * @param {Any} toCheckFor - the reference to check for
 * @param {Array<Object>} - the array to check the reference for
 * @returns {Boolean} - returns true if the reference is present in the
 *  given array
 */
StateResolver.prototype.checkForKnownRef_ = function (toCheckFor, knownRefs) {

  return knownRefs.indexOf(toCheckFor) > -1;
};

/**
 * Returns a plain Javascript object of type APIVariable which represents a
 * Javascript number. The value field of the APIVariable instance must be
 * converted to type string since the API only accepts string-typed values.
 * @function marshalNumberIntoAPIObject_
 * @memberof StateResolver
 * @param {Number} scopeVar - the number value of the variable
 * @param {String} varName - the name of the variable
 * @returns {APIVariable} - returns an instance of APIVariable which represents
 *  a number
 */
StateResolver.prototype.marshalNumberIntoAPIObject_ = function (scopeVar, varName) {

  return ({
    name: varName,
    value: scopeVar.toString(),
    type: "number"
  });
};

/**
 * Returns a plain Javascript object of type APIVariable which represents a
 * Javascript string.
 * @function marshalStringIntoAPIObject_
 * @memberof StateResolver
 * @param {String} scopeVar - the string value of the variable
 * @param {String} varName - the name of the variable
 * @returns {APIVariable} - returns an instance of APIVariable which represents
 *  a string
 */
StateResolver.prototype.marshalStringIntoAPIObject_ = function (scopeVar, varName) {

  return({
    name: varName,
    value: scopeVar,
    type: "string"
  });
};

/**
 * Returns a plain Javascript object of type APIVariable which represents a
 * Javascript boolean.
 * @function marshalBooleanIntoAPIObject_
 * @memberof StateResolver
 * @param {Boolean} scopeVar - the boolean value of the variable
 * @param {String} varName - the name of the variable
 * @returns {APIVariable} - returns an instance of APIVariable which represents
 *  a boolean
 */
StateResolver.prototype.marshalBooleanIntoAPIObject_ = function (scopeVar, varName) {

  return({
    name: varName,
    value: scopeVar.toString(),
    type: "boolean"
  });
};

/**
 * Returns a plain Javascript object of type APIVariable which represents an
 * instance of Javascript undefined.
 * @function marshalUndefinedIntoAPIObject_
 * @memberof StateResolver
 * @param {Undefined} scopeVar - the undefined value of the variable
 * @param {String} varName - the name of the variable
 * @returns {APIVariable} - returns an instance of APIVariable which represents
 *  an instance of undefined
 */
StateResolver.prototype.marshalUndefinedIntoAPIObject_ = function (scopeVar, varName) {

  return({
    name: varName,
    value: 'undefined',
    type: 'undefined'
  });
};

/**
 * Returns a plain Javascript object of type APIVariable which represents a
 * Javascript null type. The value field of the APIVariable instance must be
 * converted to type string since the API only accepts string-typed values.
 * @function marshalNullIntoAPIObject_
 * @memberof StateResolver
 * @param {Null} scopeVar - the null value of the variable
 * @param {String} varName - the name of the variable
 * @returns {APIVariable} - returns an instance of APIVariable which represents
 *  null
 */
StateResolver.prototype.marshalNullIntoAPIObject_ = function (scopeVar, varName) {

  return({
    name: varName,
    value: "null",
    type: "null"
  });
};

/**
 * A stub for objects which contain circular references, instead of exceeding
 * max stack calls a property which creates a circular reference is labelled as
 * a string with the value `[circular]` to indicate that the value is circular.
 * @function marhsalCircularIntoAPIObject_
 * @memberof StateResolver
 * @param {Object} scopeVar - the value of the circular reference
 * @param {String} varName - the variable name to be labelled as circular
 * @returns {APIVariable} - returns an instance of APIVariable which represents
 *  a circular reference
 */
StateResolver.prototype.marhsalCircularIntoAPIObject_ = function (scopeVar, varName) {
  var constructorName = 'Unknown Constructor';

  if (isObject(scopeVar) && isObject(scopeVar.constructor)
    && isString(scopeVar.constructor.name)) {

    constructorName = scopeVar.constructor.name;    
  }

  return({
    name: varName,
    value: [constructorName, '[circular]'].join(': '),
    type: 'string'
  });
};

/**
 * Returns a toString-ed function value for consumption by the API.
 * @function marshalFunctionIntoAPIObject_
 * @memberof StateResolver
 * @param {Object} scopeVar - the toString-ed value of the function
 * @param {String} varName - the variable name to be labelled as a function
 * @returns {APIVariable} - returns an instance of APIVariable which represents
 *  a function
 */
StateResolver.prototype.marshalFunctionIntoAPIObject_ = function (scopeVar, varName) {

  return({
    name: varName,
    value: scopeVar.toString(),
    type: 'function'
  });
};

/**
 * Returns a plain Javascript object of type APIVariable which represents a
 * Javascript Array. This function will not cast its `members` value property
 * to type string since this will be done by a JSON.stringify process called
 * later in the StateResolver class.
 * @function marshalArrayIntoAPIObject_
 * @memberof StateResolver
 * @param {Array<Any>} scopeVar - the variable to extract array data from
 * @param {String} varName - the name of the variable to extract data from
 * @param {Array<Object>} knownRefs - an array of already seen object references
 * @returns {APIVariable} - returns a plain Javascript object of type
 *  APIVariable representing an Array
 */
StateResolver.prototype.marshalArrayIntoAPIObject_ = function (scopeVar, varName, knownRefs) {
  var self = this;

  if (this.checkForKnownRef_(scopeVar, knownRefs)) {

    return this.marhsalCircularIntoAPIObject_(scopeVar, varName);
  }

  knownRefs.push(scopeVar);

  return ({
    name: varName,
    type: "array",
    members: scopeVar.map(
      function ( val, index ) {

        return self.marshalExtractedVarIntoAPIObject_(val, index.toString(), knownRefs);
      }
    ).concat([
      {
        name: "length",
        value: scopeVar.length.toString(),
        type: "number"
      }
    ])
  });
};

/**
 * Returns a plain Javascript object of type APIVariable which represents a
 * Javascript Plain Object. This function will not cast its `members` value 
 * property to type string since this will be done by JSON.stringify process
 * called later in the StateResolver class.
 * @function marshalObjectIntoAPIObject_
 * @memberof StateResolver
 * @param {Object} scopeVar - the variable to extract object data from
 * @param {String} varName - the name of the variable to extract data from
 * @param {Array<Object>} knowRefs - an array of already seen object references
 * @returns {APIVariable} - returns a plain Javascript object of type
 *  APIVariable representing an Object
 */
StateResolver.prototype.marshalObjectIntoAPIObject_ = function (scopeVar, varName, knownRefs) {
  var oKeys = [];
  var membersArray = [];

  if ( this.checkForKnownRef_(scopeVar, knownRefs) ) {

    return this.marhsalCircularIntoAPIObject_(scopeVar, varName);
  }

  knownRefs.push(scopeVar);
  oKeys = keys(scopeVar);

  for ( var i = 0; i < oKeys.length; i++ ) {

    membersArray.push(
      this.marshalExtractedVarIntoAPIObject_(scopeVar[oKeys[i]],
        oKeys[i].toString(), knownRefs)
    );
  }

  return ({
    name: varName,
    type: "object",
    members: membersArray
  });
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
