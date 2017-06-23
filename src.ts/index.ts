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

import {DebugAgentConfig} from './agent/config';
import {Debuglet} from './agent/debuglet';
import {Debug} from './debug';
import {AuthOptions} from './types/common-types';

// Singleton.
let debuglet;

/**
 * Start the Debug agent that will make your application available for debugging
 * with Stackdriver Debug.
 *
 * @param {object=} options - Options
 * @param {object=} options.debugAgent - Debug agent configuration
 * TODO: add an optional callback function.
 *
 * @resource [Introductory video]{@link
 * https://www.youtube.com/watch?v=tyHcK_kAOpw}
 *
 * @example
 * debug.startAgent();
 */
export function start(options: DebugAgentConfig|
                      {debug?: DebugAgentConfig}): Debuglet|undefined {
  options = options || {};
  // TODO: Update the documentation to specify that the options object
  //       contains a `debug` attribute and not a `debugAgent` object.
  // TODO: Determine how to remove this cast to `any`.
  const agentConfig = (options as any).debug || options;

  // forceNewAgent_ is for testing purposes only.
  if (debuglet && !agentConfig.forceNewAgent_) {
    throw new Error('Debug Agent has already been started');
  }

  // TODO: Determine how to remove this cast to `AuthOptions`.
  const debug = new Debug(options as AuthOptions);
  debuglet = new Debuglet(debug, agentConfig);
  debuglet.start();

  // We return the debuglet to facilitate testing.
  return agentConfig.testMode_ ? debuglet : undefined;
}
