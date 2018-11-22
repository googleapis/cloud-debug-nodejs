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

import is from '@sindresorhus/is';
import * as util from 'util';
import * as vm from 'vm';

import {StatusMessage} from '../../client/stackdriver/status-message';
import * as stackdriver from '../../types/stackdriver';
import * as v8 from '../../types/v8';
import {ResolvedDebugAgentConfig} from '../config';
import {debugAssert} from '../util/debug-assert';


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
export function evaluate(expression: string, frame: v8.FrameMirror):
    {error: string|null, mirror?: v8.ValueMirror} {
  // First validate the expression to make sure it doesn't mutate state
  const acorn = require('acorn');
  try {
    const ast = acorn.parse(expression, {sourceType: 'script'});
    const validator = require('../util/validator');
    if (!validator.isValid(ast)) {
      return {error: 'Expression not allowed'};
    }
  } catch (err) {
    return {error: err.message};
  }

  // Now actually ask V8 to evaluate the expression
  try {
    const mirror = frame.evaluate(expression);
    return {error: null, mirror};
  } catch (error) {
    return {error};
  }
}

interface ScopeType {
  Global: {};
  Script: {};
  Closure: {};
  Local: {};
}

interface LegacyVm {
  runInDebugContext: (context: string) => ScopeType;
}

class StateResolver {
  private state: v8.ExecutionState;
  private expressions: string[];
  private config: ResolvedDebugAgentConfig;
  private ctx: v8.Debug;
  private evaluatedExpressions: stackdriver.Variable[];
  private totalSize: number;
  private messageTable: stackdriver.Variable[];
  private resolvedVariableTable: stackdriver.Variable[];
  private rawVariableTable: Array<v8.ValueMirror|null>;
  private scopeType: ScopeType;
  /**
   * @param {!Object} execState
   * @param {Array<string>} expressions
   * @param {!Object} config
   * @constructor
   */
  constructor(
      execState: v8.ExecutionState, expressions: string[],
      config: ResolvedDebugAgentConfig, v8debug: v8.Debug) {
    this.state = execState;
    this.expressions = expressions;
    this.config = config;
    this.ctx = v8debug;

    this.evaluatedExpressions = [];
    this.totalSize = 0;

    this.messageTable = [];
    this.messageTable[BUFFER_FULL_MESSAGE_INDEX] = {
      status: new StatusMessage(
          StatusMessage.VARIABLE_VALUE, 'Max data size reached', true)
    };
    this.messageTable[NATIVE_PROPERTY_MESSAGE_INDEX] = {
      status: new StatusMessage(
          StatusMessage.VARIABLE_VALUE, 'Native properties are not available',
          true)
    };
    this.messageTable[GETTER_MESSAGE_INDEX] = {
      status: new StatusMessage(
          StatusMessage.VARIABLE_VALUE,
          'Properties with getters are not available', true)
    };
    this.messageTable[ARG_LOCAL_LIMIT_MESSAGE_INDEX] = {
      status: new StatusMessage(
          StatusMessage.VARIABLE_VALUE,
          'Locals and arguments are only displayed for the ' +
              'top `config.capture.maxExpandFrames=' +
              config.capture.maxExpandFrames + '` stack frames.',
          true)
    };

    // TODO: Determine why _extend is used here
    this.resolvedVariableTable =
        (util as {} as {_extend: Function})._extend([], this.messageTable);
    this.rawVariableTable = this.messageTable.map(() => {
      return null;
    });

    // This constructor is only used in situations where the legacy vm
    // interface is used that has the `runInDebugContext` method.
    this.scopeType = (vm as {} as LegacyVm).runInDebugContext('ScopeType');
  }


  /**
   * Captures the stack and current execution state.
   *
   * @return an object with stackFrames, variableTable, and
   *         evaluatedExpressions fields
   */
  capture_(): stackdriver.Breakpoint {
    const that = this;

    // Evaluate the watch expressions
    const evalIndexSet = new Set();
    if (that.expressions) {
      that.expressions.forEach((expression, index2) => {
        const result = evaluate(expression, that.state.frame(0));
        let evaluated;

        if (result.error) {
          evaluated = {
            name: expression,
            status: new StatusMessage(
                StatusMessage.VARIABLE_VALUE, result.error, true)
          };
        } else {
          // TODO: Determine how to not downcast this to v8.ValueMirror
          // TODO: Handle the case where `result.mirror` is `undefined`.
          evaluated = that.resolveVariable_(
              expression, result.mirror as v8.ValueMirror, true);
          const varTableIdx = evaluated.varTableIndex;
          if (typeof varTableIdx !== 'undefined') {
            evalIndexSet.add(varTableIdx);
          }
        }
        that.evaluatedExpressions[index2] = evaluated;
      });
    }

    // The frames are resolved after the evaluated expressions so that
    // evaluated expressions can be evaluated as much as possible within
    // the max data size limits
    const frames = that.resolveFrames_();
    // Now resolve the variables
    let index = this.messageTable.length;  // skip the sentinel values
    const noLimit = that.config.capture.maxDataSize === 0;
    while (index <
               that.rawVariableTable.length &&  // NOTE: length changes in loop
           (that.totalSize < that.config.capture.maxDataSize || noLimit)) {
      assert.ok(!that.resolvedVariableTable[index]);  // shouldn't have it
                                                      // resolved yet
      const isEvaluated = evalIndexSet.has(index);
      // TODO: This code suggests that an ObjectMirror and Stutus are the
      //       same.  Resolve this.
      that.resolvedVariableTable[index] = that.resolveMirror_(
          that.rawVariableTable[index] as v8.ObjectMirror, isEvaluated);
      index++;
    }

    // If we filled up the buffer already, we need to trim the remainder
    if (index < that.rawVariableTable.length) {
      that.trimVariableTable_(index, frames);
    }
    return {
      // TODO (fgao): Add path attribute to avoid explicit cast to
      // stackdriver.SourceLocation once breakpoint is passed in this class.
      id: 'dummy-id',
      location: {line: this.state.frame(0).sourceLine() + 1} as
          stackdriver.SourceLocation,
      stackFrames: frames,
      variableTable: that.resolvedVariableTable,
      evaluatedExpressions: that.evaluatedExpressions
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
  trimVariableTable_(fromIndex: number, frames: stackdriver.StackFrame[]):
      void {
    this.resolvedVariableTable.splice(
        fromIndex);  // remove the remaining entries

    const that = this;
    const processBufferFull = (variables: stackdriver.Variable[]) => {
      variables.forEach((variable) => {
        if (variable.varTableIndex && variable.varTableIndex >= fromIndex) {
          // make it point to the sentinel 'buffer full' value
          variable.varTableIndex = BUFFER_FULL_MESSAGE_INDEX;
          variable.status = that.messageTable[BUFFER_FULL_MESSAGE_INDEX].status;
        }
        if (variable.members) {
          processBufferFull(variable.members);
        }
      });
    };

    frames.forEach((frame) => {
      processBufferFull(frame.arguments);
      processBufferFull(frame.locals);
    });
    processBufferFull(this.evaluatedExpressions);
    processBufferFull(this.resolvedVariableTable);
  }

  resolveFrames_(): stackdriver.StackFrame[] {
    const frames: stackdriver.StackFrame[] = [];
    const frameCount =
        Math.min(this.state.frameCount(), this.config.capture.maxFrames);

    for (let i = 0; i < frameCount; i++) {
      const frame = this.state.frame(i);
      if (this.shouldFrameBeResolved_(frame)) {
        frames.push(this.resolveFrame_(
            frame, (i < this.config.capture.maxExpandFrames)));
      }
    }
    return frames;
  }

  shouldFrameBeResolved_(frame: v8.FrameMirror): boolean {
    // Only capture data from the frames for which we can link the data back
    // to the source files.

    const fullPath = this.resolveFullPath_(frame);

    if (!this.isPathInCurrentWorkingDirectory_(fullPath)) {
      return false;
    }

    const relativePath = this.resolveRelativePath_(frame);
    if (!this.config.capture.includeNodeModules &&
        this.isPathInNodeModulesDirectory_(relativePath)) {
      return false;
    }

    return true;
  }

  resolveFullPath_(frame: v8.FrameMirror): string {
    const func = frame.func();
    if (!func.resolved()) {
      return '';
    }

    const script = func.script();
    if (!script) {
      return '';
    }

    return script.name();
  }

  resolveRelativePath_(frame: v8.FrameMirror): string {
    const fullPath = this.resolveFullPath_(frame);
    return this.stripCurrentWorkingDirectory_(fullPath);
  }

  stripCurrentWorkingDirectory_(path: string): string {
    // Strip 1 extra character to remove the slash.
    return path.substr((this.config.workingDirectory).length + 1);
  }

  isPathInCurrentWorkingDirectory_(path: string): boolean {
    // return true;
    return path.indexOf(this.config.workingDirectory) === 0;
  }

  isPathInNodeModulesDirectory_(path: string): boolean {
    return path.indexOf('node_modules') === 0;
  }

  resolveFrame_(frame: v8.FrameMirror, underFrameCap: boolean):
      stackdriver.StackFrame {
    const args: stackdriver.Variable[] = [];
    // TODO: `locals` should be of type v8.ScopeMirror[]
    //       Resolve conflicts so that it can be specified of that type.
    let locals: Array<{}> = [];
    // Locals and arguments are safe to collect even when
    // `config.allowExpressions=false` since we properly avoid inspecting
    // interceptors and getters by default.
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
      // We will use the values aggregated from the ScopeMirror traversal stored
      // in locals which will include any applicable arguments from the
      // invocation.
      locals = this.resolveLocalsList_(frame);
      if (is.emptyArray(locals)) {
        locals = [];
      }
    }
    return {
      function: this.resolveFunctionName_(frame.func()),
      location: this.resolveLocation_(frame),
      arguments: args,
      locals
    };
  }

  resolveFunctionName_(func: v8.FunctionMirror): string {
    if (!func || !func.isFunction()) {
      return '';
    }
    return func.name() || func.inferredName() || '(anonymous function)';
  }

  resolveLocation_(frame: v8.FrameMirror): stackdriver.SourceLocation {
    return {
      path: this.resolveRelativePath_(frame),
      // V8 uses 0-based line numbers but Debuglet API uses 1-based numbers.
      line: frame.sourceLine() + 1
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
  resolveLocalsList_(frame: v8.FrameMirror): stackdriver.Variable[] {
    const self = this;
    const usedNames: {[name: string]: boolean} = {};
    const makeMirror = this.ctx.MakeMirror;
    const allScopes = frame.allScopes();
    const count = allScopes.length;

    // There will always be at least 3 scopes.
    // For top-level breakpoints: [local, script, global]
    // Other: [..., closure (module IIFE), script, global]
    assert.ok(count >= 3);
    assert.strictEqual(allScopes[count - 1].scopeType(), self.scopeType.Global);
    assert.strictEqual(allScopes[count - 2].scopeType(), self.scopeType.Script);

    // We find the top-level (module global) variable pollute the local
    // variables we omit them by default, unless the breakpoint itself is
    // top-level. The last two scopes are always omitted.
    let scopes: v8.ScopeMirror[];
    if (allScopes[count - 3].scopeType() === self.scopeType.Closure) {
      scopes = allScopes.slice(0, -3);
    } else {
      assert.ok(allScopes[count - 3].scopeType() === self.scopeType.Local);
      scopes = allScopes.slice(0, -2);
    }

    const fromScopes = scopes.map((scope: v8.ScopeMirror) => {
      const obj = scope.details().object();
      return Object.keys(obj).reduce((acc, name) => {
        const value = obj[name];
        const trg = makeMirror(value);
        if (!usedNames[name]) {
          // It's a valid variable that belongs in the locals list
          // and wasn't discovered at a lower-scope
          usedNames[name] = true;
          // TODO: Determine how to not have an explicit down cast to
          // ValueMirror
          acc.push(self.resolveVariable_(name, trg as v8.ValueMirror, false));
        }
        return acc;
      }, [] as stackdriver.Variable[]);
    });

    function resolveFromReceiver(): stackdriver.Variable[] {
      // The frame receiver is the 'this' context that is present during
      // invocation. Check to see whether a receiver context is substantive,
      // (invocations may be bound to null) if so: store in the locals list
      // under the name 'context' which is used by the Chrome DevTools.
      const ctx = frame.details().receiver();
      if (ctx) {
        // TODO: Determine how to not have an explicit down cast to
        // ValueMirror
        return [self.resolveVariable_(
            'context', makeMirror(ctx) as v8.ValueMirror, false)];
      }
      return [];
    }

    return [].concat.apply([], fromScopes).concat(resolveFromReceiver());
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
  resolveVariable_(name: string, value: v8.ValueMirror, isEvaluated: boolean):
      stackdriver.Variable {
    let size = name.length;

    const data: stackdriver.Variable = {name};

    if (value.isPrimitive() || value.isRegExp()) {
      // primitives: undefined, null, boolean, number, string, symbol
      data.value = value.toText();
      const maxLength = this.config.capture.maxStringLength;
      if (!isEvaluated && maxLength && maxLength < data.value.length) {
        data.status = new StatusMessage(
            StatusMessage.VARIABLE_VALUE,
            'Only first `config.capture.maxStringLength=' +
                this.config.capture.maxStringLength +
                '` chars were captured for string of length ' +
                data.value.length +
                '. Use in an expression to see the full string.',
            false);
        data.value = data.value.substring(0, maxLength) + '...';
      }

    } else if (value.isFunction()) {
      // TODO: Determine how to resolve this so that a ValueMirror doesn't need
      //       to be cast to a FunctionMirror.
      data.value = 'function ' +
          this.resolveFunctionName_(value as v8.FunctionMirror) + '()';
    } else if (value.isObject()) {
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

    this.totalSize += size;

    return data;
  }

  getVariableIndex_(valueMirror: v8.ValueMirror): number {
    let idx = this.rawVariableTable.findIndex(
        rawVar => !!rawVar && rawVar.value() === valueMirror.value());
    if (idx === -1) {
      idx = this.storeObjectToVariableTable_(valueMirror);
    }
    return idx;
  }

  storeObjectToVariableTable_(obj: v8.ValueMirror): number {
    const idx = this.rawVariableTable.length;
    this.rawVariableTable[idx] = obj;
    return idx;
  }

  /**
   * Responsible for recursively resolving the properties on a
   * provided object mirror.
   */
  resolveMirror_(mirror: v8.ObjectMirror, isEvaluated: boolean):
      stackdriver.Variable {
    let properties = mirror.properties();
    const maxProps = this.config.capture.maxProperties;
    const truncate = maxProps && properties.length > maxProps;
    if (!isEvaluated && truncate) {
      properties = properties.slice(0, maxProps);
    }
    // TODO: It looks like `members` should be of type stackdriver.Variable[]
    //       but is missing fields.  Determine if those fields are required or
    //       if the type should not be stackdriver.Variable[]
    const members =
        properties.map(this.resolveMirrorProperty_.bind(this, isEvaluated));
    if (!isEvaluated && truncate) {
      // TDOO: Determine how to remove this explicit cast
      members.push({
        name: 'Only first `config.capture.maxProperties=' +
            this.config.capture.maxProperties +
            '` properties were captured. Use in an expression' +
            ' to see all properties.'
      });
    }
    return {value: mirror.toText(), members};
  }

  resolveMirrorProperty_(isEvaluated: boolean, property: v8.PropertyMirror):
      stackdriver.Variable {
    const name = String(property.name());
    // Array length must be special cased as it is a native property that
    // we know to be safe to evaluate which is not generally true.
    const isArrayLen = property.mirror_.isArray() && name === 'length';
    if (property.isNative() && !isArrayLen) {
      return {name, varTableIndex: NATIVE_PROPERTY_MESSAGE_INDEX};
    }
    if (property.hasGetter()) {
      return {name, varTableIndex: GETTER_MESSAGE_INDEX};
    }
    return this.resolveVariable_(name, property.value(), isEvaluated);
  }
}

// This function is used by unit tests to make sure assertions are enabled.
export function testAssert(): void {
  assert.strictEqual(0, 1);
}

/**
 * Captures the stack and current execution state.
 *
 * @return an object with stackFrames, variableTable, and
 *         evaluatedExpressions fields
 */
export function capture(
    execState: v8.ExecutionState, expressions: string[],
    config: ResolvedDebugAgentConfig,
    v8debug: v8.Debug): stackdriver.Breakpoint {
  return (new StateResolver(execState, expressions, config, v8debug))
      .capture_();
}
