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

/**
 * @typedef {object} DebugAgentConfig
 */
export interface DebugAgentConfig {
  /**
   * @property {?string}
   * @memberof DebugAgentConfig
   * @default
   */
  workingDirectory: string|null;

  /**
   * @property {?string} A user specified way of identifying the service
   * that the debug agent is monitoring.
   * @memberof DebugAgentConfig
   * @default
   */
  description: string|null;

  /**
   * @property {boolean} Whether or not it is permitted to evaluate expressions.
   * Locals and arguments are not displayed and watch expressions and
   * conditions are dissallowed when this is `false`.
   * @memberof DebugAgentConfig
   * @default
   */
  allowExpressions: boolean;

  /**
   * @property {object} Identifies the context of the running service -
   * [ServiceContext](https://cloud.google.com/error-reporting/reference/rest/v1beta1/ServiceContext?authuser=2).
   * This information is utilized in the UI to identify all the running
   * instances of your service. This is discovered automatically when your
   * application is running on Google Cloud Platform. You may optionally
   * choose to provide this information yourself to identify your service
   * differently from the default mechanism.
   * @memberof DebugAgentConfig
   * @default
   */
  serviceContext: {
    /**
     * @property {?string} the service name
     * @default
     */
    service: string | null;

    /**
     * @property {?string} the service version
     * @default
     */
    version: string | null;

    /**
     * @property {?string} a unique deployment identifier. This is used
     * internally only.
     * @private
     */
    minorVersion_: string | null;
  };

  /**
   * @property {?string}   The path within your repository to the directory
   * containing the package.json for your deployed application. This should
   * be provided if your deployed application appears as a subdirectory of
   * your repository. Usually this is unnecessary, but may be useful in
   * cases where the debug agent is unable to resolve breakpoint locations
   * unambiguously.
   * @memberof DebugAgentConfig
   * @default
   */
  appPathRelativeToRepository: string|null;

  /**
   * @property {number} agent log level 0-disabled, 1-error, 2-warn, 3-info,
   * 4-debug
   * @memberof DebugAgentConfig
   * @default
   */
  logLevel: number;

  /**
   * @property {number} How frequently should the list of breakpoints be
   * refreshed from the cloud debug server.
   * @memberof DebugAgentConfig
   * @default
   */
  breakpointUpdateIntervalSec: number;

  /**
   * @property {number} breakpoints and logpoints older than this number of
   * seconds will be expired on the server.
   * @memberof DebugAgentConfig
   * @default
   */
  breakpointExpirationSec: number;

  /**
   * @property {object} configuration options on what is captured on a
   * snapshot.
   * @memberof DebugAgentConfig
   */
  capture: {
    /**
     * @property {boolean} Whether to include details about stack frames
     * belonging to node-core.
     * @default
     */
    includeNodeModules: boolean;


    /**
     * @property {number} Maximum number of stack frames to capture data for.
     * The limit is aimed to reduce overall capture time.
     * @default
     */
    maxFrames: number;

    /**
     * @property {number} We collect locals and arguments on a few top frames.
     * For the rest only collect the source location
     * @default
     */
    maxExpandFrames: number;

    /**
     * @property {number} To reduce the overall capture time, limit the number
     * of properties gathered on large objects. A value of 0 disables the
     * limit.
     * @default
     */
    maxProperties: number;

    /**
     * @property {number} Total 'size' of data to gather. This is NOT the
     * number of bytes of data that are sent over the wire, but instead a
     * very very coarse approximation based on the length of names and
     * values of the properties. This should be somewhat proportional to the
     * amount of processing needed to capture the data and subsequently the
     * network traffic. A value of 0 disables the limit.
     * @default
     */
    maxDataSize: number;

    /**
     * @property {number} To limit the size of the buffer, we truncate long
     * strings. A value of 0 disables truncation.
     * @default
     */
    maxStringLength: number;
  };

  /**
   * @property {object} options affecting log points.
   * @memberof DebugAgentConfig
   */
  log: {
    /**
     * @property {number} The maximum number of logs to record per second per
     * logpoint.
     * @memberof DebugAgentConfig
     * @default
     */
    maxLogsPerSecond: number;

    /**
     * @property {number} Number of seconds to wait after the
     * `maxLogsPerSecond` rate is hit before logging resumes per logpoint.
     * @default
     */
    logDelaySeconds: number;
  };

  /**
   * @property {object} These configuration options are for internal
   * experimentation only.
   * @memberof DebugAgentConfig
   * @private
   */
  internal: {
    registerDelayOnFetcherErrorSec: number; maxRegistrationRetryDelay: number;
  };

  /**
   * @property {boolean} Used by tests to force loading of a new agent if one
   * exists already
   * @memberof DebugAgentConfig
   * @private
   */
  forceNewAgent_: boolean;

  /**
   * @property {boolean} Uses by tests to cause the start() function to return
   * the debuglet.
   * @memberof DebugAgentConfig
   * @private
   */
  testMode_: boolean;
}

const defaultConfig: DebugAgentConfig = {
  // FIXME(ofrobots): presently this is dependent what cwd() is at the time this
  // file is first required. We should make the default config static.
  workingDirectory: process.cwd(),
  description: null,
  allowExpressions: false,

  // FIXME(ofrobots): today we prioritize GAE_MODULE_NAME/GAE_MODULE_VERSION
  // over the user specified config. We should reverse that.
  serviceContext: {service: null, version: null, minorVersion_: null},

  appPathRelativeToRepository: null,
  logLevel: 1,
  breakpointUpdateIntervalSec: 10,
  breakpointExpirationSec: 60 * 60 * 24,  // 24 hours

  capture: {
    includeNodeModules: false,
    maxFrames: 20,
    maxExpandFrames: 5,
    maxProperties: 10,
    maxDataSize: 20000,
    maxStringLength: 100
  },

  log: {maxLogsPerSecond: 50, logDelaySeconds: 1},

  internal: {
    registerDelayOnFetcherErrorSec: 300,  // 5 minutes.
    maxRegistrationRetryDelay: 40
  },

  forceNewAgent_: false,
  testMode_: false
};

export default defaultConfig;
