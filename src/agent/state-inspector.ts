/**
 * Copyright 2017 Google Inc. All Rights Reserved.
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

// TODO: Unify some common code with state.ts in future PRs.

import * as inspector from 'inspector';
import * as lodash from 'lodash';
import * as util from 'util';

import {debugAssert} from './debug-assert';

const isEmpty = lodash.isEmpty;

import {StatusMessage} from '../status-message';

import * as apiTypes from '../types/api-types';
import {DebugAgentConfig} from './config';
import {V8Inspector} from './v8inspector';

const assert = debugAssert(!!process.env.CLOUD_DEBUG_ASSERTIONS);

// Error message indices into the resolved variable table.
const BUFFER_FULL_MESSAGE_INDEX = 0;
const NATIVE_PROPERTY_MESSAGE_INDEX = 1;
const GETTER_MESSAGE_INDEX = 2;
const ARG_LOCAL_LIMIT_MESSAGE_INDEX = 3;


/**
 * Checks that the provided expressions will not have side effects and
 * then evaluates the expression in the current execution context.
 *
 * @return an object with error and mirror fields.
 */
export function evaluate(
    expression: string, frame: inspector.Debugger.CallFrame,
    v8inspector: V8Inspector):
    {error: string|null, object?: inspector.Runtime.RemoteObject} {
  // First validate the expression to make sure it doesn't mutate state
  const acorn = require('acorn');
  try {
    const ast = acorn.parse(expression, {sourceType: 'script'});
    const validator = require('./validator');
    if (!validator.isValid(ast)) {
      return {error: 'expression not allowed'};
    }
  } catch (err) {
    return {error: err.message};
  }

  // Now actually ask V8 Inspector to evaluate the expression
  const result = v8inspector.evaluateOnCallFrame(frame.callFrameId, expression);
  if (result.error || !result.response) {
    return {
      error: result.error ? String(result.error) : 'no reponse in result'
    };
  } else if (result.response.exceptionDetails) {
    return {error: String(result.response.exceptionDetails)};
  } else {
    return {error: null, object: result.response.result};
  }
}

class StateResolver {
  private callFrames_: Array<inspector.Debugger.CallFrame>;
  private v8Inspector_: V8Inspector;
  private expressions_: string[]|undefined;
  private config_: DebugAgentConfig;
  private scriptmapper_: {[id: string]: any};
  private breakpoint_: apiTypes.Breakpoint;
  private evaluatedExpressions_: apiTypes.Variable[];
  private totalSize_: number;
  private messageTable_: apiTypes.Variable[];
  private resolvedVariableTable_: apiTypes.Variable[];
  private rawVariableTable_: Array<any>;

  /**
   * @param {Array<!Object>} callFrames
   * @param {Array<string>} expressions
   * @param {!Object} config
   * @constructor
   */
  constructor(
      callFrames: Array<inspector.Debugger.CallFrame>,
      breakpoint: apiTypes.Breakpoint, config: DebugAgentConfig,
      scriptmapper: {[id: string]: any}, v8Inspector: V8Inspector) {
    this.callFrames_ = callFrames;
    this.breakpoint_ = breakpoint;
    // TODO: Investigate whether this cast can be avoided.
    this.expressions_ = breakpoint.expressions;
    this.config_ = config;
    this.scriptmapper_ = scriptmapper;
    this.v8Inspector_ = v8Inspector;

    this.evaluatedExpressions_ = [];
    this.totalSize_ = 0;

    this.messageTable_ = [];
    this.messageTable_[BUFFER_FULL_MESSAGE_INDEX] = {
      status: new StatusMessage(
          StatusMessage.VARIABLE_VALUE, 'Max data size reached', true)
    };
    this.messageTable_[NATIVE_PROPERTY_MESSAGE_INDEX] = {
      status: new StatusMessage(
          StatusMessage.VARIABLE_VALUE, 'Native properties are not available',
          true)
    };
    this.messageTable_[GETTER_MESSAGE_INDEX] = {
      status: new StatusMessage(
          StatusMessage.VARIABLE_VALUE,
          'Properties with getters are not available', true)
    };
    this.messageTable_[ARG_LOCAL_LIMIT_MESSAGE_INDEX] = {
      status: new StatusMessage(
          StatusMessage.VARIABLE_VALUE,
          'Locals and arguments are only displayed for the ' +
              'top `config.capture.maxExpandFrames=' +
              config.capture.maxExpandFrames + '` stack frames.',
          true)
    };

    // TODO: Determine why _extend is used here
    this.resolvedVariableTable_ = (util as any)._extend([], this.messageTable_);
    this.rawVariableTable_ = this.messageTable_.map(function() {
      return null;
    });
  }


  /**
   * Captures the stack and current execution state.
   *
   * @return an object with stackFrames, variableTable, and
   *         evaluatedExpressions fields
   */
  capture_(): apiTypes.Breakpoint {
    // Evaluate the watch expressions
    const evalIndexSet = new Set();
    if (this.expressions_) {
      this.expressions_.forEach((expression, index2) => {
        const result =
            evaluate(expression, this.callFrames_[0], this.v8Inspector_);
        let evaluated;
        if (result.error) {
          evaluated = {
            name: expression,
            status: new StatusMessage(
                StatusMessage.VARIABLE_VALUE, result.error, true)
          };
        } else {
          // TODO: Determine how to not downcast this to v8Types.ValueMirror
          // TODO: Handle the case where `result.mirror` is `undefined`.
          evaluated = this.resolveVariable_(
              expression, result.object as inspector.Runtime.RemoteObject,
              true);
          const varTableIdx = evaluated.varTableIndex;
          if (typeof varTableIdx !== 'undefined') {
            evalIndexSet.add(varTableIdx);
          }
        }
        this.evaluatedExpressions_[index2] = evaluated;

      });
    }
    // The frames are resolved after the evaluated expressions so that
    // evaluated expressions can be evaluated as much as possible within
    // the max data size limits
    let frames = this.resolveFrames_();
    // Now resolve the variables
    let index = this.messageTable_.length;  // skip the sentinel values
    const noLimit = this.config_.capture.maxDataSize === 0;
    while (index <
               this.rawVariableTable_.length &&  // NOTE: length changes in loop
           (this.totalSize_ < this.config_.capture.maxDataSize || noLimit)) {
      assert(!this.resolvedVariableTable_[index]);  // shouldn't have it
                                                    // resolved yet
      const isEvaluated = evalIndexSet.has(index);
      if (this.rawVariableTable_[index].objectId) {
        this.resolvedVariableTable_[index] = this.resolveRemoteObject_(
            this.rawVariableTable_[index], isEvaluated);
      }
      index++;
    }
    // If we filled up the buffer already, we need to trim the remainder
    if (index < this.rawVariableTable_.length) {
      this.trimVariableTable_(index, frames);
    }
    return {
      stackFrames: frames,
      variableTable: this.resolvedVariableTable_,
      evaluatedExpressions: this.evaluatedExpressions_
    };
  }

  /**
   * Limits the size of the variable table to `fromIndex` elements. It marks
   * all variables with entries beyond `fromIndex` with a message indicating
   * that the table filled.
   *
   * @param {Number} fromIndex The desired size of the variable table.
   * @param {Object} frames Frames associated with the current execution
   *                        environment.
   */
  trimVariableTable_(fromIndex: number, frames: apiTypes.StackFrame[]): void {
    this.resolvedVariableTable_.splice(
        fromIndex);  // remove the remaining entries

    const that = this;
    const processBufferFull = function(variables: apiTypes.Variable[]) {
      variables.forEach(function(variable) {
        if (variable.varTableIndex && variable.varTableIndex >= fromIndex) {
          // make it point to the sentinel 'buffer full' value
          variable.varTableIndex = BUFFER_FULL_MESSAGE_INDEX;
          variable.status =
              that.messageTable_[BUFFER_FULL_MESSAGE_INDEX].status;
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
  }

  resolveFrames_(): apiTypes.StackFrame[] {
    const frames: apiTypes.StackFrame[] = [];
    const frameCount =
        Math.min(this.callFrames_.length, this.config_.capture.maxFrames);
    for (let i = 0; i < frameCount; i++) {
      const frame = this.callFrames_[i];
      if (this.shouldFrameBeResolved_(frame)) {
        frames.push(this.resolveFrame_(
            frame, (i < this.config_.capture.maxExpandFrames)));
      }
    }
    return frames;
  }

  shouldFrameBeResolved_(frame: inspector.Debugger.CallFrame): boolean {
    // Only capture data from the frames for which we can link the data back
    // to the source files.
    const fullPath = this.resolveFullPath_(frame);
    if (!this.isPathInCurrentWorkingDirectory_(fullPath)) {
      return false;
    }

    const relativePath = this.resolveRelativePath_(frame);
    if (!this.config_.capture.includeNodeModules &&
        this.isPathInNodeModulesDirectory_(relativePath)) {
      return false;
    }

    return true;
  }

  resolveFullPath_(frame: inspector.Debugger.CallFrame): string {
    const scriptId: string = frame.location.scriptId;
    if (this.scriptmapper_[scriptId] === undefined) {
      return '';
    }
    if (this.scriptmapper_[scriptId].url === undefined) {
      return '';
    }
    return this.scriptmapper_[scriptId].url;
  }

  resolveRelativePath_(frame: inspector.Debugger.CallFrame): string {
    const fullPath = this.resolveFullPath_(frame);
    return this.stripCurrentWorkingDirectory_(fullPath);
  }

  stripCurrentWorkingDirectory_(path: string): string {
    // Strip 1 extra character to remove the slash.
    // TODO: Handle the case where `this.config_.workingDirectory` is `null`.
    return path.substr((this.config_.workingDirectory as string).length + 1);
  }

  isPathInCurrentWorkingDirectory_(path: string): boolean {
    // return true;
    // TODO: Handle the case where `this.config_.workingDirectory` is `null`.
    return path.indexOf(this.config_.workingDirectory as string) === 0;
  }

  isPathInNodeModulesDirectory_(path: string): boolean {
    return path.indexOf('node_modules') === 0;
  }

  resolveFrame_(frame: inspector.Debugger.CallFrame, underFrameCap: boolean):
      apiTypes.StackFrame {
    let args: Array<apiTypes.Variable> = [];
    let locals: Array<any> = [];

    if (!underFrameCap) {
      args.push({
        name: 'arguments_not_available',
        varTableIndex: ARG_LOCAL_LIMIT_MESSAGE_INDEX
      });
      locals.push({
        name: 'locals_not_available',
        varTableIndex: ARG_LOCAL_LIMIT_MESSAGE_INDEX
      });
    } else {
      locals = this.resolveLocalsList_(frame);

      if (isEmpty(locals)) {
        locals = [];
      }
    }
    return {
      function: this.resolveFunctionName_(frame),
      location: this.resolveLocation_(frame),
      arguments: args,
      locals: locals
    };
  }

  resolveFunctionName_(frame: inspector.Debugger.CallFrame): string {
    if (!frame) {
      return '';
    }
    if (frame.functionName === '') {
      return '(anonymous function)';
    }
    return frame.functionName;
  }

  resolveLocation_(frame: inspector.Debugger.CallFrame):
      apiTypes.SourceLocation {
    return {
      path: this.resolveRelativePath_(frame),
      line: frame.location.lineNumber
    };
  }

  /**
   * Iterates and returns variable information for all scopes (excluding global)
   * in a given frame. FrameMirrors should return their scope object list with
   * most deeply nested scope first so variables initially encountered will take
   * precedence over subsequent instance with the same name - this is tracked in
   * the usedNames map. The argument list given to this function may be
   * manipulated if variables with a deeper scope occur which have the same
   * name.
   * @function resolveLocalsList_
   * @memberof StateResolver
   * @param {inspector.Debugger.CallFrame} frame - A instance of callframe.
   * @returns {Array<Object>} - returns an array containing data about selected
   *  variables
   */
  resolveLocalsList_(frame: inspector.Debugger.CallFrame): apiTypes.Variable[] {
    let locals: Array<any> = [];

    const usedNames: {[name: string]: boolean} = {};
    const allScopes = frame.scopeChain;
    let count = allScopes.length;
    // We find the top-level (module global) variable pollute the local
    // variables we omit them by default, unless the breakpoint itself is
    // top-level. The last scope is always omitted.
    if (frame.scopeChain[count - 2].type === 'closure')
      count -= 2;
    else
      count -= 1;
    for (let i = 0; i < count; ++i) {
      let result = this.v8Inspector_.getProperties(
          frame.scopeChain[i].object.objectId as string);
      // TODO: Handle when result.error exists.
      if (result.response && !isEmpty(result.response.result)) {
        for (let j = 0; j < result.response.result.length; ++j) {
          if (!usedNames[result.response.result[j].name]) {
            // It's a valid variable that belongs in the locals list
            // and wasn't discovered at a lower-scope
            usedNames[result.response.result[j].name] = true;
            if (result.response.result[j].value) {
              locals.push(this.resolveVariable_(
                  result.response.result[j].name,
                  result.response.result[j].value as
                      inspector.Runtime.RemoteObject,
                  false));
            }
          }
        }
      }
    }
    if (frame.this.objectId) {
      locals.push(this.resolveVariable_('context', frame.this, false));
    }
    return locals;
  }

  /**
   * Computes a text representation of the provided value based on its type.
   * If the value is a recursive data type, it will be represented as an index
   * into the variable table.
   *
   * @param {String} name The name of the variable.
   * @param {Object} object A RemoteObject from v8 Runtime.
   * @param {boolean} isEvaluated Specifies if the variable is from a watched
   *                              expression.
   */
  resolveVariable_(
      name: string, object: inspector.Runtime.RemoteObject,
      isEvaluated: boolean): apiTypes.Variable {
    let size = name.length;
    const data: apiTypes.Variable = {name: name};
    if (this.isPrimitive_(object.type)) {
      // primitives: undefined, null, boolean, number, string, symbol
      data.value = String(object.value);
      const maxLength = this.config_.capture.maxStringLength;
      if (!isEvaluated && maxLength && maxLength < data.value.length) {
        data.status = new StatusMessage(
            StatusMessage.VARIABLE_VALUE,
            'Only first `config.capture.maxStringLength=' +
                this.config_.capture.maxStringLength +
                '` chars were captured for string of length ' +
                data.value.length +
                '. Use in an expression to see the full string.',
            false);
        data.value = data.value.substring(0, maxLength) + '...';
      }
    } else if (this.isFunction_(object.type)) {
      data.value =
          'function ' + (name === '' ? '(anonymous function)' : name + '()');
    } else if (this.isObject_(object.type)) {
      data.varTableIndex = this.getVariableIndex_(object);
    } else {
      data.value = 'unknown type';
    }

    if (data.value) {
      size += data.value.length;
    } else {
      size += 8;  // fudge-it
    }
    this.totalSize_ += size;
    return data;
  }

  isPrimitive_(type: string): boolean {
    return type === 'undefined' || type === 'boolean' || type === 'number' ||
        type === 'string' || type === 'symbol';
  }

  isObject_(type: string): boolean {
    return type === 'object';
  }

  isFunction_(type: string): boolean {
    return type === 'function';
  }

  getVariableIndex_(value: any): number {
    let idx = this.rawVariableTable_.indexOf(value);
    if (idx === -1) {
      idx = this.storeObjectToVariableTable_(value);
    }
    return idx;
  }

  storeObjectToVariableTable_(obj: any): number {
    let idx = this.rawVariableTable_.length;
    this.rawVariableTable_[idx] = obj;
    return idx;
  }

  /**
   * Responsible for recursively resolving the properties on a
   * provided remote object.
   */
  resolveRemoteObject_(
      object: inspector.Runtime.RemoteObject,
      isEvaluated: boolean): apiTypes.Variable {
    const maxProps = this.config_.capture.maxProperties;
    let result = this.v8Inspector_.getProperties(object.objectId as string);
    let members: Array<any> = [];
    if (result.error || !result.response) {
      members.push({
        name: result.error ? String(result.error) :
                             'no response got in getProperty'
      });
    } else {
      let truncate = maxProps && result.response.result.length > maxProps;
      let upperBound = result.response.result.length;
      if (!isEvaluated && truncate) upperBound = maxProps;
      for (let i = 0; i < upperBound; ++i) {
        if (result.response.result[i].isOwn) {
          members.push(this.resolveObjectProperty_(
              isEvaluated, result.response.result[i]));
        } else {
          truncate = false;
        }
      }

      if (!isEvaluated && truncate) {
        members.push({
          name: 'Only first `config.capture.maxProperties=' +
              this.config_.capture.maxProperties +
              '` properties were captured. Use in an expression' +
              ' to see all properties.'
        });
      }
    }
    return {value: object.description, members: members};
  }

  resolveObjectProperty_(isEvaluated: boolean, property: any):
      apiTypes.Variable {
    const name = String(property.name);
    if (property.get !== undefined) {
      return {name: name, varTableIndex: GETTER_MESSAGE_INDEX};
    }
    return this.resolveVariable_(name, property.value, isEvaluated);
  }
}

// This function is used by unit tests to make sure assertions are enabled.
export function testAssert(): void {
  assert.equal(0, 1);
}

/**
 * Captures the stack and current execution state.
 *
 * @return an object with stackFrames, variableTable, and
 *         evaluatedExpressions fields
 */
export function capture(
    callFrames: Array<inspector.Debugger.CallFrame>,
    breakpoint: apiTypes.Breakpoint, config: DebugAgentConfig,
    scriptmapper: {[id: string]: any},
    v8Inspector: V8Inspector): apiTypes.Breakpoint {
  return (new StateResolver(
              callFrames, breakpoint, config, scriptmapper, v8Inspector))
      .capture_();
}
