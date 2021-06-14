// Copyright 2017 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// eslint-disable-next-line node/no-unsupported-features/node-builtins
import * as inspector from 'inspector';

import consoleLogLevel = require('console-log-level');

export class V8Inspector {
  // The V8 debugger session.
  session: inspector.Session | null = null;

  // Store of the v8 setBreakpoint parameters for each v8 breakpoint so that
  // later the recorded parameters can be used to reset the breakpoints.
  storeSetBreakpointParams: {
    [
      v8BreakpointId: string
    ]: inspector.Debugger.SetBreakpointByUrlParameterType;
  } = {};

  // Number of paused events before the next reset.
  numPausedBeforeReset = 0;

  constructor(
    readonly logger: consoleLogLevel.Logger,
    readonly useWellFormattedUrl: boolean,
    readonly resetV8DebuggerThreshold: number,
    readonly onScriptParsed: (
      script: inspector.Debugger.ScriptParsedEventDataType
    ) => void,
    readonly onPaused: (params: inspector.Debugger.PausedEventDataType) => void
  ) {}

  /**
   * Whether to add a 'file://' prefix to a URL when setting breakpoints.
   */
  shouldUseWellFormattedUrl() {
    return this.useWellFormattedUrl;
  }

  setBreakpointByUrl(
    params: inspector.Debugger.SetBreakpointByUrlParameterType
  ) {
    this.attach();

    const result: {
      error?: Error;
      response?: inspector.Debugger.SetBreakpointByUrlReturnType;
    } = {};
    this.session!.post(
      'Debugger.setBreakpointByUrl',
      params,
      (
        error: Error | null,
        response: inspector.Debugger.SetBreakpointByUrlReturnType
      ) => {
        if (error) {
          result.error = error;
        } else {
          this.storeSetBreakpointParams[response.breakpointId] = params;
        }
        result.response = response;
      }
    );
    return result;
  }

  removeBreakpoint(breakpointId: string) {
    this.attach();

    const result: {error?: Error} = {};
    this.session!.post(
      'Debugger.removeBreakpoint',
      {breakpointId},
      (error: Error | null) => {
        if (error) {
          result.error = error;
        } else {
          delete this.storeSetBreakpointParams[breakpointId];
        }

        // If there is no active V8 breakpoints, then detach the session.
        if (Object.keys(this.storeSetBreakpointParams).length === 0) {
          this.detach();
        }
      }
    );
    return result;
  }

  evaluateOnCallFrame(
    options: inspector.Debugger.EvaluateOnCallFrameParameterType
  ) {
    this.attach();

    const result: {
      error?: Error;
      response?: inspector.Debugger.EvaluateOnCallFrameReturnType;
    } = {};
    this.session!.post(
      'Debugger.evaluateOnCallFrame',
      options,
      (
        error: Error | null,
        response: inspector.Debugger.EvaluateOnCallFrameReturnType
      ) => {
        if (error) result.error = error;
        result.response = response;
      }
    );
    return result;
  }

  getProperties(options: inspector.Runtime.GetPropertiesParameterType) {
    const result: {
      error?: Error;
      response?: inspector.Runtime.GetPropertiesReturnType;
    } = {};
    this.attach();

    this.session!.post(
      'Runtime.getProperties',
      options,
      (
        error: Error | null,
        response: inspector.Runtime.GetPropertiesReturnType
      ) => {
        if (error) result.error = error;
        result.response = response;
      }
    );
    return result;
  }

  /** Attaches to the V8 debugger. */
  private attach() {
    if (this.session) {
      return;
    }

    const session = new inspector.Session();
    session.connect();
    session.on('Debugger.scriptParsed', script => {
      this.onScriptParsed(script.params);
    });
    session.post('Debugger.enable');
    session.post('Debugger.setBreakpointsActive', {active: true});
    session.on('Debugger.paused', message => {
      this.onPaused(message.params);
      this.resetV8DebuggerIfMeetThreshold();
    });

    this.session = session;
  }

  /** Detaches from the V8 debugger. */
  detach() {
    if (!this.session) {
      return;
    }

    this.session!.disconnect();
    this.session = null;
    this.storeSetBreakpointParams = {};
    this.numPausedBeforeReset = 0;
  }

  /**
   * Resets the debugging session when the threshold. This is primarily for
   * cleaning the memory usage hold by V8 debugger when hitting the V8
   * breakpoints too many times.
   */
  private resetV8DebuggerIfMeetThreshold() {
    this.numPausedBeforeReset += 1;
    if (this.numPausedBeforeReset < this.resetV8DebuggerThreshold) {
      return;
    }
    this.numPausedBeforeReset = 0;

    const previouslyStoredParams = this.storeSetBreakpointParams;

    this.detach();
    this.attach();

    // Setting the v8 breakpoints again according to the stored parameters.
    for (const params of Object.values(previouslyStoredParams)) {
      const res = this.setBreakpointByUrl(params);
      if (res.error || !res.response) {
        this.logger.error('Error upon re-setting breakpoint: ' + res);
      }
    }
  }
}
