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
import * as inspector from 'inspector';
import * as lodash from 'lodash';
import * as util from 'util';

import {debugAssert} from './debug-assert';

const isEmpty = lodash.isEmpty;

import {StatusMessage} from '../status-message';

import * as apiTypes from '../types/api-types';
import {DebugAgentConfig} from './config';

// TODO: Determine if `ScopeType` should be named `scopeType`.
// tslint:disable-next-line:variable-name
// const ScopeType = vm.runInDebugContext('ScopeType');
const assert = debugAssert(process.env.CLOUD_DEBUG_ASSERTIONS);

// Error message indices into the resolved variable table.
const BUFFER_FULL_MESSAGE_INDEX = 0;
const NATIVE_PROPERTY_MESSAGE_INDEX = 1;
const GETTER_MESSAGE_INDEX = 2;
const ARG_LOCAL_LIMIT_MESSAGE_INDEX = 3;

class StateResolver {
  private callFrames_: Array<inspector.Debugger.CallFrame>;
  private expressions_: string[];
  private config_: DebugAgentConfig;
  private scriptmapper_: {[id: string]: any};
  private breakpoint_: apiTypes.Breakpoint;
  private session_: inspector.Session;
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
      scriptmapper: {[id: string]: any}, session: inspector.Session) {
    this.callFrames_ = callFrames;
    this.breakpoint_ = breakpoint;
    this.expressions_ = breakpoint.expressions as string[];
    this.config_ = config;
    this.scriptmapper_ = scriptmapper;
    this.session_ = session;

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
  capture_(): void {
    const that = this;

    // Evaluate the watch expressions
    that.breakpoint_.evaluatedExpressions = [];
    const evalIndexSet = new Set();
    if (that.expressions_) {
      that.expressions_.forEach(function(expression, index2) {
        const acorn = require('acorn');
        try {
          const ast = acorn.parse(expression, {sourceType: 'script'});
          const validator = require('./validator');
          if (!validator.isValid(ast)) {
            that.breakpoint_.evaluatedExpressions[index2] = {
              name: expression,
              status: new StatusMessage(
                  StatusMessage.VARIABLE_VALUE, 'expression not allowed', true)
            };
            return;
          }
        } catch (err) {
          that.breakpoint_.evaluatedExpressions[index2] = {
            name: expression,
            status: new StatusMessage(
                StatusMessage.VARIABLE_VALUE, err.message, true)
          };
          return;
        }
        that.session_.post(
            'Debugger.evaluateOnCallFrame', {
              callFrameId: that.callFrames_[0].callFrameId,
              expression: expression
            },
            (error: Error | null, response: any) => {
              if (error) console.error(error);
              if (response.exceptionDetails !== undefined) {
                that.breakpoint_.evaluatedExpressions[index2] = {
                  name: expression,
                  status: new StatusMessage(
                      StatusMessage.VARIABLE_VALUE,
                      String(response.exceptionDetails), true)
                };
              } else {
                let evaluated =
                    that.resolveVariable_(expression, response.result, true);
                const varTableIdx = evaluated.varTableIndex;
                if (typeof varTableIdx !== 'undefined') {
                  evalIndexSet.add(varTableIdx);
                }
                that.breakpoint_.evaluatedExpressions[index2] = evaluated;
              }
            });
      });
    }

    // The frames are resolved after the evaluated expressions so that
    // evaluated expressions can be evaluated as much as possible within
    // the max data size limits
    that.resolveFrames_();
    // Now resolve the variables
    let index = this.messageTable_.length;  // skip the sentinel values
    const noLimit = that.config_.capture.maxDataSize === 0;
    while (index <
               that.rawVariableTable_.length &&  // NOTE: length changes in loop
           (that.totalSize_ < that.config_.capture.maxDataSize || noLimit)) {
      assert(!that.resolvedVariableTable_[index]);  // shouldn't have it
                                                    // resolved yet
      const isEvaluated = evalIndexSet.has(index);
      // TODO: This code suggests that an ObjectMirror and Stutus are the
      //       same.  Resolve this.
      that.resolveVariableTable_(
          that.rawVariableTable_[index], isEvaluated, index);
      index++;
    }

    // If we filled up the buffer already, we need to trim the remainder
    if (index < that.rawVariableTable_.length) {
      that.trimVariableTable_(index);
    }
    this.breakpoint_.variableTable = that.resolvedVariableTable_;
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
  trimVariableTable_(fromIndex: number): void {
    let frames: apiTypes.StackFrame[] = this.breakpoint_.stackFrames;
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
    processBufferFull(
        this.breakpoint_.evaluatedExpressions as apiTypes.Variable[]);
    processBufferFull(this.resolvedVariableTable_);
  }

  resolveFrames_(): void {
    const frames: apiTypes.StackFrame[] = [];
    this.breakpoint_.stackFrames = frames;
    const frameCount =
        Math.min(this.callFrames_.length, this.config_.capture.maxFrames);

    for (let i = 0; i < frameCount; i++) {
      const frame = this.callFrames_[i];
      if (this.shouldFrameBeResolved_(frame)) {
        this.resolveFrame_(frame, (i < this.config_.capture.maxExpandFrames));
      }
    }
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
    let scriptId: string = frame.location.scriptId;
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
      void {
    let args: Array<apiTypes.Variable> = [];
    // TODO: `locals` should be of type v8Types.ScopeMirror[]
    //       Resolve conflicts so that it can be specified of that type.
    let locals: Array<any> = [];
    // Locals and arguments are safe to collect even when
    // `config.allowExpressions=false` since we properly avoid inspecting
    // interceptors and getters by default.
    this.breakpoint_.stackFrames.push({
      function: this.resolveFunctionName_(frame),
      location: this.resolveLocation_(frame),
      arguments: args,
      locals: locals,
    });
    let stackFramesLength = this.breakpoint_.stackFrames.length;
    if (!underFrameCap) {
      this.breakpoint_.stackFrames[stackFramesLength - 1].arguments.push({
        name: 'arguments_not_available',
        varTableIndex: ARG_LOCAL_LIMIT_MESSAGE_INDEX
      });
      this.breakpoint_.stackFrames[stackFramesLength - 1].locals.push({
        name: 'locals_not_available',
        varTableIndex: ARG_LOCAL_LIMIT_MESSAGE_INDEX
      });
    } else {
      // We will use the values aggregated from the ScopeMirror traversal stored
      // in locals which will include any applicable arguments from the
      // invocation.
      this.breakpoint_.stackFrames[stackFramesLength - 1].arguments = [];
      this.resolveLocalsList_(frame, args, stackFramesLength);
    }
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
   * @param {FrameMirror} frame - A instance of FrameMirror
   * @param {Array<Object>} args - An array of objects representing any function
   *  arguments the frame may list
   * @returns {Array<Object>} - returns an array containing data about selected
   *  variables
   */
  resolveLocalsList_(
      frame: inspector.Debugger.CallFrame, args: any,
      stackFramesLength: number): void {
    // TODO: Determine why `args` is never used in this function
    args = args;

    // const self = this;
    const usedNames: {[name: string]: boolean} = {};
    // const makeMirror = this.ctx_.MakeMirror;
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
      this.session_.post(
          'Runtime.getProperties',
          {objectId: frame.scopeChain[i].object.objectId as string},
          (error: Error | null, response: any) => {
            if (error) console.error('e1', error);
            if (isEmpty(response.result)) {
              this.breakpoint_.stackFrames[stackFramesLength - 1].locals = [];
            }
            for (let j = 0; j < response.result.length; ++j) {
              if (!usedNames[response.result[j].name]) {
                // It's a valid variable that belongs in the locals list
                // and wasn't discovered at a lower-scope
                usedNames[response.result[j].name] = true;
                this.breakpoint_.stackFrames[stackFramesLength - 1].locals.push(
                    this.resolveVariable_(
                        response.result[j].name, response.result[j].value,
                        false));
              }
            }
          });
    }
  }

  /**
   * Computes a text representation of the provided value based on its type.
   * If the value is a recursive data type, it will be represented as an index
   * into the variable table.
   *
   * @param {String} name The name of the variable.
   * @param {Object} value A v8 debugger representation of a variable value.
   * @param {boolean} isEvaluated Specifies if the variable is from a watched
   *                              expression.
   */
  resolveVariable_(name: string, value: any, isEvaluated: boolean):
      apiTypes.Variable {
    let size = name.length;
    const data: apiTypes.Variable = {name: name};
    if (this.isPrimitive_(value.type)) {
      // primitives: undefined, null, boolean, number, string, symbol
      data.value = String(value.value);
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
    } else if (this.isFunction_(value.type)) {
      // TODO: Determine how to resolve this so that a ValueMirror doesn't need
      //       to be cast to a FunctionMirror.

      data.value =
          'function ' + (name === '' ? '(anonymous function)' : name + '()');
    } else if (this.isObject_(value.type)) {
      data.varTableIndex = this.getVariableIndex_(value);
    } else {
      // PropertyMirror, InternalPropertyMirror, FrameMirror, ScriptMirror
      data.value = 'unknown mirror type';
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
   * provided object mirror.
   */
  resolveVariableTable_(mirror: any, isEvaluated: boolean, index: number):
      void {
    const maxProps = this.config_.capture.maxProperties;
    if (mirror.objectId === undefined) return;
    this.session_.post(
        'Runtime.getProperties', {objectId: mirror.objectId as string},
        (error: Error | null, response: any) => {
          if (error) console.error('e', error);
          let members: Array<any> = [];
          let truncate = maxProps && response.result.length > maxProps;
          let upperBound = response.result.length;
          if (!isEvaluated && truncate) upperBound = maxProps;
          for (let i = 0; i < upperBound; ++i) {
            if (response.result[i].isOwn) {
              members.push(
                  this.resolveMirrorProperty_(isEvaluated, response.result[i]));
            }
          }
          if (!isEvaluated && truncate) {
            // TDOO: Determine how to remove this explicit cast
            members.push({
              name: 'Only first `config.capture.maxProperties=' +
                  this.config_.capture.maxProperties +
                  '` properties were captured. Use in an expression' +
                  ' to see all properties.'
            });
          }
          this.resolvedVariableTable_[index] = {
            value: mirror.description,
            members: members
          };
        });
  }

  resolveMirrorProperty_(isEvaluated: boolean, property: any):
      apiTypes.Variable {
    const name = String(property.name);
    // Array length must be special cased as it is a native property that
    // we know to be safe to evaluate which is not generally true.
    // const isArrayLen = property.mirror_.isArray() && name === 'length';
    // if (property.isNative() && !isArrayLen) {
    //   return {name: name, varTableIndex: NATIVE_PROPERTY_MESSAGE_INDEX};
    // }
    // if (property.hasGetter()) {
    //   return {name: name, varTableIndex: GETTER_MESSAGE_INDEX};
    // }

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
    scriptmapper: {[id: string]: any}, session: inspector.Session): void {
  (new StateResolver(callFrames, breakpoint, config, scriptmapper, session))
      .capture_();
}
