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

import is from '@sindresorhus/is';
import * as inspector from 'inspector';
import * as util from 'util';

import {StatusMessage} from '../../client/stackdriver/status-message';
import * as stackdriver from '../../types/stackdriver';
import {ResolvedDebugAgentConfig} from '../config';
import {debugAssert} from '../util/debug-assert';
import {V8Inspector} from '../v8/v8inspector';

const assert = debugAssert(!!process.env.CLOUD_DEBUG_ASSERTIONS);

// Error message indices into the resolved variable table.
const BUFFER_FULL_MESSAGE_INDEX = 0;
const NATIVE_PROPERTY_MESSAGE_INDEX = 1;
const GETTER_MESSAGE_INDEX = 2;
const ARG_LOCAL_LIMIT_MESSAGE_INDEX = 3;

const FILE_PROTOCOL = 'file://';

/**
 * Checks that the provided expressions will not have side effects and
 * then evaluates the expression in the current execution context.
 *
 * @return an object with error and mirror fields.
 */
export function evaluate(
    expression: string, frame: inspector.Debugger.CallFrame,
    v8inspector: V8Inspector, returnByValue: boolean):
    {error: string|null, object?: inspector.Runtime.RemoteObject} {
  // First validate the expression to make sure it doesn't mutate state
  // and ask V8 Inspector to evaluate the expression
  const result = v8inspector.evaluateOnCallFrame({
    callFrameId: frame.callFrameId,
    expression,
    returnByValue,
    throwOnSideEffect: true
  });
  if (result.error || !result.response) {
    return {
      error: result.error ? String(result.error) : 'no reponse in result'
    };
  } else if (result.response.exceptionDetails) {
    return {error: String(result.response.result.description).split('\n')[0]};
  } else {
    return {error: null, object: result.response.result};
  }
}

class StateResolver {
  private callFrames: inspector.Debugger.CallFrame[];
  private v8Inspector: V8Inspector;
  private expressions: string[]|undefined;
  private config: ResolvedDebugAgentConfig;
  private scriptmapper: {[id: string]: {url: string}};
  private breakpoint: stackdriver.Breakpoint;
  private evaluatedExpressions: stackdriver.Variable[];
  private totalSize: number;
  private messageTable: stackdriver.Variable[];
  private resolvedVariableTable: stackdriver.Variable[];
  private rawVariableTable: Array<inspector.Runtime.RemoteObject|null>;

  /**
   * @param {Array<!Object>} callFrames
   * @param {Array<string>} expressions
   * @param {!Object} config
   * @constructor
   */
  constructor(
      callFrames: inspector.Debugger.CallFrame[],
      breakpoint: stackdriver.Breakpoint, config: ResolvedDebugAgentConfig,
      scriptmapper: {[id: string]: {url: string}}, v8Inspector: V8Inspector) {
    this.callFrames = callFrames;
    this.breakpoint = breakpoint;
    // TODO: Investigate whether this cast can be avoided.
    this.expressions = breakpoint.expressions;
    this.config = config;
    this.scriptmapper = scriptmapper;
    this.v8Inspector = v8Inspector;

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
  }


  /**
   * Captures the stack and current execution state.
   *
   * @return an object with stackFrames, variableTable, and
   *         evaluatedExpressions fields
   */
  capture_(): stackdriver.Breakpoint {
    // Evaluate the watch expressions
    const evalIndexSet = new Set();
    if (this.expressions) {
      this.expressions.forEach((expression, index2) => {
        const result =
            evaluate(expression, this.callFrames[0], this.v8Inspector, false);
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
        this.evaluatedExpressions[index2] = evaluated;
      });
    }
    // The frames are resolved after the evaluated expressions so that
    // evaluated expressions can be evaluated as much as possible within
    // the max data size limits
    const frames = this.resolveFrames_();
    // Now resolve the variables
    let index = this.messageTable.length;  // skip the sentinel values
    const noLimit = this.config.capture.maxDataSize === 0;
    while (index <
               this.rawVariableTable.length &&  // NOTE: length changes in loop
           (this.totalSize < this.config.capture.maxDataSize || noLimit)) {
      assert.ok(!this.resolvedVariableTable[index]);  // shouldn't have it
                                                      // resolved yet
      const isEvaluated = evalIndexSet.has(index);
      // TODO: Handle the cases where `null` or `undefined` occurs
      if (this.rawVariableTable![index]!.objectId) {
        this.resolvedVariableTable[index] = this.resolveRemoteObject_(
            this.rawVariableTable[index]!, isEvaluated);
      }
      index++;
    }
    // If we filled up the buffer already, we need to trim the remainder
    if (index < this.rawVariableTable.length) {
      this.trimVariableTable_(index, frames);
    }
    return {
      id: this.breakpoint.id,
      stackFrames: frames,
      variableTable: this.resolvedVariableTable,
      evaluatedExpressions: this.evaluatedExpressions
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
        Math.min(this.callFrames.length, this.config.capture.maxFrames);
    for (let i = 0; i < frameCount; i++) {
      const frame = this.callFrames[i];
      if (this.shouldFrameBeResolved_(frame)) {
        frames.push(this.resolveFrame_(
            frame, (i < this.config.capture.maxExpandFrames)));
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
    if (!this.config.capture.includeNodeModules &&
        this.isPathInNodeModulesDirectory_(relativePath)) {
      return false;
    }

    return true;
  }

  resolveFullPath_(frame: inspector.Debugger.CallFrame): string {
    const scriptId: string = frame.location.scriptId;
    if (this.scriptmapper[scriptId] === undefined) {
      return '';
    }
    if (this.scriptmapper[scriptId].url === undefined) {
      return '';
    }
    const scriptUrl = this.scriptmapper[scriptId].url;
    // In Node 11+, non-internal files are formatted as URLs, so get just the
    // path.
    return StateResolver.stripFileProtocol_(scriptUrl);
  }

  resolveRelativePath_(frame: inspector.Debugger.CallFrame): string {
    const fullPath = this.resolveFullPath_(frame);
    return this.stripCurrentWorkingDirectory_(fullPath);
  }

  static stripFileProtocol_(path: string) {
    return path.toLowerCase().startsWith(FILE_PROTOCOL) ?
        path.substr(FILE_PROTOCOL.length) :
        path;
  }

  stripCurrentWorkingDirectory_(path: string): string {
    // Strip 1 extra character to remove the slash.
    return StateResolver.stripFileProtocol_(path).substr(
        (this.config.workingDirectory!).length + 1);
  }

  isPathInCurrentWorkingDirectory_(path: string): boolean {
    return StateResolver.stripFileProtocol_(path).indexOf(
               this.config.workingDirectory) === 0;
  }

  isPathInNodeModulesDirectory_(path: string): boolean {
    return StateResolver.stripFileProtocol_(path).indexOf('node_modules') === 0;
  }

  resolveFrame_(frame: inspector.Debugger.CallFrame, underFrameCap: boolean):
      stackdriver.StackFrame {
    const args: stackdriver.Variable[] = [];
    let locals: Array<{}> = [];

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

      if (is.emptyArray(locals)) {
        locals = [];
      }
    }
    return {
      function: this.resolveFunctionName_(frame),
      location: this.resolveLocation_(frame),
      arguments: args,
      locals
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
      stackdriver.SourceLocation {
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
  resolveLocalsList_(frame: inspector.Debugger.CallFrame):
      stackdriver.Variable[] {
    const locals: Array<{}> = [];

    const usedNames: {[name: string]: boolean} = {};
    const allScopes = frame.scopeChain;
    let count = allScopes.length;
    // We find the top-level (module global) variable pollute the local
    // variables we omit them by default, unless the breakpoint itself is
    // top-level. The last scope is always omitted.
    if (frame.scopeChain[count - 2].type === 'closure') {
      count -= 2;
    } else {
      count -= 1;
    }
    for (let i = 0; i < count; ++i) {
      const result = this.v8Inspector.getProperties(
          {objectId: frame.scopeChain[i].object.objectId as string});
      // TODO: Handle when result.error exists.
      if (result.response && !is.emptyArray(result.response.result)) {
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
      isEvaluated: boolean): stackdriver.Variable {
    let size = name.length;
    const data: stackdriver.Variable = {name};
    if (this.isPrimitive_(object.type)) {
      // primitives: undefined, null, boolean, number, string, symbol
      data.value = String(object.value);
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
    this.totalSize += size;
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

  getVariableIndex_(value: inspector.Runtime.RemoteObject): number {
    let idx = this.rawVariableTable.indexOf(value);
    if (idx === -1) {
      idx = this.storeObjectToVariableTable_(value);
    }
    return idx;
  }

  storeObjectToVariableTable_(obj: inspector.Runtime.RemoteObject): number {
    const idx = this.rawVariableTable.length;
    this.rawVariableTable[idx] = obj;
    return idx;
  }

  /**
   * Responsible for recursively resolving the properties on a
   * provided remote object.
   */
  resolveRemoteObject_(
      object: inspector.Runtime.RemoteObject,
      isEvaluated: boolean): stackdriver.Variable {
    const maxProps = this.config.capture.maxProperties;
    const result =
        this.v8Inspector.getProperties({objectId: object.objectId as string});
    const members: Array<{}> = [];
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
              this.config.capture.maxProperties +
              '` properties were captured. Use in an expression' +
              ' to see all properties.'
        });
      }
    }
    return {value: object.description, members};
  }

  resolveObjectProperty_(
      isEvaluated: boolean,
      property: inspector.Runtime.PropertyDescriptor): stackdriver.Variable {
    const name = String(property.name);
    if (property.get !== undefined) {
      return {name, varTableIndex: GETTER_MESSAGE_INDEX};
    }
    // TODO: Handle the case when property.value is undefined
    return this.resolveVariable_(name, property.value!, isEvaluated);
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
    callFrames: inspector.Debugger.CallFrame[],
    breakpoint: stackdriver.Breakpoint, config: ResolvedDebugAgentConfig,
    scriptmapper: {[id: string]: {url: string}},
    v8Inspector: V8Inspector): stackdriver.Breakpoint {
  return (new StateResolver(
              callFrames, breakpoint, config, scriptmapper, v8Inspector))
      .capture_();
}
