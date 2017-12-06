/**
 * Copyright 2015 Google Inc. All Rights Reserved.
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

import {DebugAgentConfig, StackdriverConfig} from './agent/config';
import {Debuglet, IsReady} from './agent/debuglet';
import {Debug} from './client/stackdriver/debug';

const pjson = require('../../package.json');

// Singleton.
let debuglet: Debuglet;

/**
 * Start the Debug agent that will make your application available for debugging
 * with Stackdriver Debug.
 *
 * @param options - Authentication and agent configuration.
 *
 * @resource [Introductory video]{@link
 * https://www.youtube.com/watch?v=tyHcK_kAOpw}
 *
 * @example
 * debug.startAgent();
 */
export function start(options?: DebugAgentConfig|StackdriverConfig): Debuglet|
    IsReady {
  options = options || {};
  const agentConfig: DebugAgentConfig =
      (options as StackdriverConfig).debug || (options as DebugAgentConfig);

  // forceNewAgent_ is for testing purposes only.
  if (debuglet && !agentConfig.forceNewAgent_) {
    throw new Error('Debug Agent has already been started');
  }

  const debug = new Debug(options, pjson);
  debuglet = new Debuglet(debug, agentConfig);
  debuglet.start();

  return agentConfig.testMode_ ? debuglet : debuglet.isReadyManager;
}
