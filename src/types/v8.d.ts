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

// TODO: Determine if the use of snake case should be allowed in this file.
// tslint:disable:variable-name

// See https://github.com/v8/v8/blob/master/src/debug/mirrors.js

export declare type MirrorType = 'undefined' | 'null' | 'boolean' | 'number' |
    'string' | 'symbol' | 'object' | 'function' | 'regexp' | 'error' |
    'property' | 'internalProperty' | 'frame' | 'script' | 'context' | 'scope' |
    'promise' | 'map' | 'set' | 'iterator' | 'generator';

export interface Mirror {
  type: () => MirrorType;
  isValue: () => boolean;
  isUndefined: () => boolean;
  isNull: () => boolean;
  isBoolean: () => boolean;
  isNumber: () => boolean;
  isString: () => boolean;
  isSymbol: () => boolean;
  isObject: () => boolean;
  isFunction: () => boolean;
  isUnresolvedFunction: () => boolean;
  isArray: () => boolean;
  isDate: () => boolean;
  isRegExp: () => boolean;
  isError: () => boolean;
  isPromise: () => boolean;
  isGenerator: () => boolean;
  isProperty: () => boolean;
  isInternalProperty: () => boolean;
  isFrame: () => boolean;
  isScript: () => boolean;
  isContext: () => boolean;
  isScope: () => boolean;
  isMap: () => boolean;
  isSet: () => boolean;
  isIterator: () => boolean;
  toText: () => string;
}

export interface ValueMirror extends Mirror {
  value_: any;
  isPrimitive: () => boolean;
  value: () => any;
}

export interface UndefinedMirror extends ValueMirror {}

export interface InternalPropertyMirror extends Mirror {
  name: () => string;
  // TODO: Determine if this should not be any
  value: () => any;
}

export interface ObjectMirror extends ValueMirror {
  className: () => string;
  constructorFunction: () => Mirror;
  prototypeObject: () => Mirror;
  protoObject: () => Mirror;
  hasNamedInterceptor: () => boolean;
  hasIndexedInterceptor: () => boolean;
  // TODO: Determine if string[] is the correct return type
  propertyNames: (kind: number, limit: number) => string[];
  // TODO: Determine if PropertyMirror[] is the corrrect return type
  //       The debug code assumes `kind` and `limit` below are optional.
  //       Determine if that is the case.
  properties: (kind?: number, limit?: number) => PropertyMirror[];
  // TODO: Determine if PropertyMirror[] is the corrrect return type
  internalProperties: () => PropertyMirror[];
  property: () => PropertyMirror | UndefinedMirror;
  lookupProperty: (value: Mirror) => PropertyMirror | UndefinedMirror;
  // TODO: Determine if the return type can be ObjectMirror[]
  referencedBy: (opt_max_objects?: number) => Mirror[];
  // TODO: Determine how to express that this is a static method
  GetInternalProperties: (value: any) => InternalPropertyMirror[];
}

export interface PropertyMirror extends Mirror {
  // TODO: Determine if this attribute should be treated as public and, if so,
  //       include the rest of the public attributes.
  mirror_: ObjectMirror;
  isReadOnly: () => boolean;
  isEnum: () => boolean;
  canDelete: () => boolean;
  name: () => string;
  isIndexed: () => boolean;
  // TODO: Determine if this return type is correct.
  //       The debug agent code expects this method to return a `ValueMirror`.
  value: () => ValueMirror;
  isException: () => boolean;
  // TODO: Determine the correct return type for these
  attributes: () => any;
  propertyType: () => any;
  hasGetter: () => boolean;
  hasSetter: () => boolean;
  getter: () => Mirror;
  setter: () => Mirror;
  isNative: () => boolean;
}

export interface FrameDetails {
  // TODO: The debug code expects this to have `arguments` and `locals` fields.
  //       The code at https://github.com/v8/v8/blob/master/src/debug/mirrors.js
  //       seems to suggest that these fields should exist.  Make sure that is
  //       the case.
  arguments: Array < {
    name: string;
    value: any;
  }
  > ;
  locals: Array < {
    name: string;
    value: any;
  }
  > ;
  break_id_: number;
  // TODO: Determine the type of details_ and the methods in this interface
  details_: any;
  frameId: () => any;
  receiver: () => any;
  func: () => any;
  script: () => any;
  isConstructCall: () => any;
  isAtReturn: () => any;
  isDebuggerFrame: () => any;
  isOptimizedFrame: () => any;
  isInlinedFrame: () => any;
  inlinedFrameIndex: () => any;
  argumentCount: () => any;
  argumentName: (index: number) => any;
  argumentValue: (index: number) => any;
  localCount: () => any;
  sourcePosition: () => any;
  localName: () => any;
  localValue: () => any;
  returnValue: () => any;
  scopeCount: () => any;
}

export interface FrameMirror extends Mirror {
  break_id_: number;
  index_: number;
  // TODO: Determine the type of details_
  details_: FrameDetails;
  details: () => FrameDetails;
  index: () => number;
  // TODO: Determine if this can be made more precise
  //       The debug agent code assumes this is a FunctionMirror
  func: () => FunctionMirror;
  // TODO: Determine if this can be made more precise
  script: () => Mirror;
  receiver: () => Mirror;
  // TODO: Determine if the return type is correct
  isConstructCall: () => boolean;
  // TODO: Determine if the return type is correct
  isAtReturn: () => boolean;
  // TODO: Determine if the return type is correct
  isDebuggerFrame: () => boolean;
  // TODO: Determine if the return type is correct
  isOptimizedFrame: () => boolean;
  // TODO: Determine if the return type is correct
  isInlinedFrame: () => boolean;
  // TODO: Determine if the return type is correct
  inlinedFrameIndex: () => number;
  // TODO: Determine if the return type is correct
  argumentCount: () => number;
  // TODO: Determine if the return type is correct
  argumentName: () => string;
  argumentValue: () => Mirror;
  // TODO: Determine if the return type is correct
  localCount: () => number;
  // TODO: Determine if the return type is correct
  localName: () => string;
  localValue: () => Mirror;
  returnValue: () => Mirror;
  // TODO: Determine if the return type is correct
  sourcePosition: () => any;
  // TODO: Determine if the return type is correct
  sourceLocation: () => any;
  // TODO: Determine if the return type is correct
  sourceLine: () => number;
  // TODO: Determine if the return type is correct
  sourceColumn: () => number;
  // TODO: Determine if the return type is correct
  sourceLineText: () => string;
  // TODO: Determine if the return type is correct
  scopeCount: () => number;
  // More precisely, the return type is ScopeMirror
  scope: () => Mirror;
  allScopes: (opt_ignore_nested_scopes?: boolean) => ScopeMirror[];
  // TODO: Determine if ValueMirror is the correct return type.
  //       The debug aget code expects the type to be ValueMirror.
  evaluate: (source: string, throw_on_side_effect?: boolean) => ValueMirror;
  invocationText: () => string;
  sourceAndPositionText: () => string;
  localsText: () => string;
  // TODO: Determine the return type
  restart: () => any;
}

// TODO: Determine and verify the types of the parameters and return types
//       of each member of this interface
export interface ScopeDetails {
  type: () => any;
  object: () => any;
  name: () => any;
  startPosition: () => any;
  endPosition: () => any;
  func: () => any;
  setVariableValueImpl: (name: string, new_value: any) => void;
}

export interface ScopeMirror extends Mirror {
  details: () => ScopeDetails;
  frameIndex: () => number;
  scopeIndex: () => number;
  // TODO: Determine this type.  It is the same as ScopeDetails#type()
  scopeType: () => any;
  scopeObject: () => Mirror;
  // TODO: Verify the parameter types and return type
  setVariableValue: (name: string, new_value: any) => void;
}

export interface ScriptMirror {
  // TODO: Determine the other members of this interface
  name: () => string;
}

export interface Location {
  // TODO: Determine the members of this interface
}

export interface ContextMirror {
  // TODO: Determine the members of this interface
}

export interface FunctionMirror extends ObjectMirror {
  resolved: () => boolean;
  name: () => string;
  debugName: () => string;
  inferredName: () => string;
  source: () => string | undefined;
  script: () => ScriptMirror | undefined;
  sourcePosition: () => number | undefined;
  sourceLocation: () => Location | undefined;
  constructedBy: (opt_max_instances?: number) => Mirror[] | undefined;
  scopeCount: () => number;
  scope: (index: number) => ScopeMirror;
  toText: () => string;
  context: () => ContextMirror;
}

// See https://github.com/v8/v8/blob/master/src/debug/debug.js and
//     https://github.com/nodejs/node/blob/master/src/node_contextify.cc
export interface ExecutionState {
  // This interface only contains the elements used within the debug agent
  // for the full implementation.
  frame: (index: number) => FrameMirror;
  frameCount: () => number;
}

// TODO: Add the rest of the methods in this interface
export interface BreakPoint {
  script_break_point: () => ScriptBreakPoint;
  // TODO: The debug code assumes these method exist.  Verify they exist.
  number: () => number;
  active: () => boolean;
}

// TODO: Add the rest of the methods in this interface
export interface ScriptBreakPoint { number: () => number; }

// TODO: Verify the return types of these methods
export interface BreakEvent {
  eventType: () => DebugEvent;
  func: () => any;
  sourceLine: () => number;
  sourceColumn: () => number;
  sourceLineText: () => string;
  breakPointsHit: () => BreakPoint[];
}

export interface DebugEvent {
  Break: DebugEvent;
  Exception: DebugEvent;
  AfterCompile: DebugEvent;
  CompileError: DebugEvent;
  AsyncTaskEvent: DebugEvent;
}

// See https://github.com/v8/v8/blob/master/src/debug/debug.js
// TODO: Add the rest of the methods in this interface
export interface Debug {
  DebugEvent: DebugEvent;
  setListener: (listener: any, opt_data?: any) => void;
  clearBreakPoint: (break_point_number: number) => void;
  setScriptBreakPointByRegExp:
      (script_regexp: RegExp, opt_line?: number, opt_column?: number,
       opt_condition?: any, opt_groupId?: number) => number;
  findBreakPoint: (break_point_number: number, remove?: boolean) => BreakPoint;
  MakeMirror: (value: any) => Mirror;
}
