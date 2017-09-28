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

export declare type Action = 'CAPTURE' | 'LOG';

export declare type Reference = 'UNSPECIFIED' | 'BREAKPOINT_SOURCE_LOCATION' |
    'BREAKPOINT_CONDITION' | 'BREAKPOINT_EXPRESSION' | 'BREAKPOINT_AGE' |
    'VARIABLE_NAME' | 'VARIABLE_VALUE';

export interface FormatMessage {
  format: string;
  // TODO: The code expects the `parameters` field to be optional.
  //       Verify if this aligns with the API reference.
  parameters?: string[];
}

export interface StatusMessage {
  isError: boolean;
  refersTo: Reference;
  description: FormatMessage;
}

export interface SourceLocation {
  path: string;
  // TODO: The code assumes a SourceLocation has a `column` attribute, but
  //       the API reference doesn't mention it.
  // TODO: The code doesn't always set the column attribute.  Is it optional?
  column?: number;
  line: number;
}

export declare type LogLevel = 'INFO' | 'WARNING' | 'ERROR';

export interface Variable {
  // TODO: Some places in the code assume the fields below are all optional.
  //       Determine if that is the case.
  varTableIndex?: number;
  name?: string;
  value?: string;
  type?: string;
  members?: Variable[];
  status?: StatusMessage;
}

export interface StackFrame {
  function: string;
  location: SourceLocation;
  arguments: Variable[];
  locals: Variable[];
}

// TODO: This is only needed for the Breakpoint.create(d)Time attribute.
//       Determine if this is actually needed or if the create(d)Time attribute
//       should only be a string.
export interface Timestamp {
  seconds: string;  // int64
  nano: string;     // int32
}

export interface Breakpoint {
  stackFrames: StackFrame[];
  // TODO: Update the code so that `|null` is not needed.
  evaluatedExpressions: Array<Variable|null>;
  // TODO: Update the code so that `|null` is not needed.
  variableTable: Array<Variable|null>;
  id: BreakpointId;
  // TODO: The debug code assumes the rest of these members
  //       are optional.  Determine if this is correct.
  action?: Action;
  location?: SourceLocation;
  condition?: string;
  expressions?: string[];
  logMessageFormat?: string;
  logLevel?: LogLevel;
  isFinalState?: boolean;
  // TODO: The API reference says the following attribute is `createTime`
  //       However, the existing code is using `createdTime`.
  // See:
  // https://cloud.google.com/debugger/api/reference/rest/v2/debugger.debuggees.breakpoints#breakpoint
  //      In addtion, the API reference says the `create(d)Time` attribute
  //      is a string in Timestamp format, but the code assumes it is a
  //      Timestamp object
  createdTime?: Timestamp;
  finalTime?: string;
  userEmail?: string;
  status?: StatusMessage;
  labels?: {
    [key: string]: string,
  };
}

export type BreakpointId = string;

export interface ListBreakpointsQuery {
  waitToken?: string;
  successOnTimeout?: boolean;
}

export interface ListBreakpointsResponse {
  breakpoints: Breakpoint[];
  nextWaitToken: string;
  waitExpired: boolean;
}
