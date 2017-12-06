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

import * as inspector from 'inspector';

export class V8Inspector {
  private session: inspector.Session;
  constructor(session: inspector.Session) {
    this.session = session;
  }
  setBreakpointByUrl(options:
                         inspector.Debugger.SetBreakpointByUrlParameterType) {
    const result: {
      error?: Error,
      response?: inspector.Debugger.SetBreakpointByUrlReturnType
    } = {};
    this.session.post(
        'Debugger.setBreakpointByUrl', options,
        (error: Error|null,
         response: inspector.Debugger.SetBreakpointByUrlReturnType) => {
          if (error) result.error = error;
          result.response = response;
        });
    return result;
  }

  removeBreakpoint(breakpointId: string) {
    const result: {error?: Error} = {};
    this.session.post(
        'Debugger.removeBreakpoint', {breakpointId}, (error: Error|null) => {
          if (error) result.error = error;
        });
    return result;
  }

  evaluateOnCallFrame(options:
                          inspector.Debugger.EvaluateOnCallFrameParameterType) {
    const result: {
      error?: Error,
      response?: inspector.Debugger.EvaluateOnCallFrameReturnType
    } = {};
    this.session.post(
        'Debugger.evaluateOnCallFrame', options,
        (error: Error|null,
         response: inspector.Debugger.EvaluateOnCallFrameReturnType) => {
          if (error) result.error = error;
          result.response = response;
        });
    return result;
  }

  getProperties(options: inspector.Runtime.GetPropertiesParameterType) {
    const result:
        {error?: Error,
         response?: inspector.Runtime.GetPropertiesReturnType} = {};
    this.session.post(
        'Runtime.getProperties', options,
        (error: Error|null,
         response: inspector.Runtime.GetPropertiesReturnType) => {
          if (error) result.error = error;
          result.response = response;
        });
    return result;
  }
}
