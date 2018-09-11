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

import {GoogleAuthOptions} from '@google-cloud/common';

export type DebugAgentConfig = GoogleAuthOptions&{
  [K in keyof ResolvedDebugAgentConfig]?: Partial<ResolvedDebugAgentConfig[K]>
};

export type LogLevel = 'error'|'trace'|'debug'|'info'|'warn'|'fatal'|undefined;
export interface Logger {
  error(...args: Array<{}>): void;
  trace(...args: Array<{}>): void;
  debug(...args: Array<{}>): void;
  info(...args: Array<{}>): void;
  warn(...args: Array<{}>): void;
  fatal(...args: Array<{}>): void;
}

export interface ProjectRepoId {
  projectId: string;
  repoName: string;
}

export interface RepoId {
  projectRepoId: ProjectRepoId;
  uid: string;
}

export interface AliasContext {
  kind: 'ANY'|'FIXED'|'MOVABLE'|'OTHER';
  name: string;
}

export interface CloudRepoSourceContext {
  repoId: RepoId;
  revisionId: string;
  aliasName?: string;
  aliasContext: AliasContext;
}

export interface CloudWorkspaceId {
  repoId: RepoId;
  name: string;
}

export interface CloudWorkspaceSourceContext {
  workspaceId: CloudWorkspaceId;
  snapshotId: string;
}

export interface GerritSourceContext {
  hostUri: string;
  gerritProject: string;
  // one of:
  revisionId?: string;
  aliasName?: string;
  aliasContext?: AliasContext;
}

export interface GitSourceContext {
  url: string;
  revisionId: string;
}

export interface ResolvedDebugAgentConfig extends GoogleAuthOptions {
  /**
   * Specifies the working directory of the application being
   * debugged. That is, the directory containing the application's
   * `package.json` file.
   *
   * The default value is the value of `process.cwd()`.
   */
  workingDirectory: string;

  /**
   * Specifies whether or not the computer's root directory should
   * be allowed for the value of the `workingDirectory` configuration
   * option.
   *
   * On startup, the debug agent scans the working directory for source
   * files.  If the working directory is the computer's root directory,
   * this scan would result is scanning the entire drive.
   *
   * To avoid this, the debug agent, by default, does not allow the
   * working directory to be computer's root directory.  That check
   * can be disabled with this configuration option.
   */
  allowRootAsWorkingDirectory: boolean;

  /**
   * A user specified way of identifying the service
   */
  description?: string;

  /**
   * Whether or not it is permitted to evaluate expressions.
   * Locals and arguments are not displayed and watch expressions and
   * conditions are dissallowed when this is `false`.
   */
  allowExpressions: boolean;

  /**
   * Identifies the context of the running service -
   * [ServiceContext](https://cloud.google.com/error-reporting/reference/rest/v1beta1/ServiceContext?authuser=2).
   * This information is utilized in the UI to identify all the running
   * instances of your service. This is discovered automatically when your
   * application is running on Google Cloud Platform. You may optionally
   * choose to provide this information yourself to identify your service
   * differently from the default mechanism.
   */
  serviceContext: {
    /**
     * The service name.
     */
    service?: string;

    /**
     * The service version.
     */
    version?: string;

    /**
     * A unique deployment identifier. This is used internally only.
     */
    minorVersion_?: string;
  };

  /**
   * A SourceContext is a reference to a tree of files. A SourceContext together
   * with a path point to a unique version of a single file or directory.
   * Managed environments such as AppEngine generate a source-contexts.json file
   * at deployment time. The agent can load the SourceContext from that file if
   * it exists. In other environments, e.g. locally, GKE, GCE, AWS, etc., users
   * can either generate the source context file, or pass the context as part of
   * the agent configuration.
   *
   * @link
   * https://cloud.google.com/debugger/api/reference/rest/v2/Debuggee#SourceContext
   */
  sourceContext?: CloudRepoSourceContext|CloudWorkspaceSourceContext|
      GerritSourceContext|GitSourceContext;

  /**
   * The path within your repository to the directory
   * containing the package.json for your deployed application. This should
   * be provided if your deployed application appears as a subdirectory of
   * your repository. Usually this is unnecessary, but may be useful in
   * cases where the debug agent is unable to resolve breakpoint locations
   * unambiguously.
   */
  appPathRelativeToRepository?: string;

  /**
   * A function which takes the path of a source file in your repository,
   * a list of your project's Javascript files known to the debugger,
   * and the file(s) in your project that the debugger thinks is identified
   * by the given path.
   *
   * This function should return the file(s) that is/are identified by the
   * given path or `undefined` to specify that the files(s) that the agent
   * thinks are associated with the file should be used.
   *
   * Note that the list of paths must be a subset of the files in `knownFiles`
   * and the debug agent can set a breakpoint for the input path if and only
   * if there is a unique file that this function returns (an array with
   * exactly one entry).
   *
   * This configuration option is usually unecessary, but can be useful in
   * situations where the debug agent cannot not identify the file in your
   * application associated with a path.
   *
   * This could occur if your application uses a structure that the debug
   * agent does not understand, or if more than one file in your application
   * has the same name.
   *
   * For example, if your running application (either locally or in the cloud)
   * has the Javascript files:
   *    /x/y/src/index.js
   *    /x/y/src/someDir/index.js
   *    /x/y/src/util.js
   * and a breakpoint is set in the `/x/y/src/index.js` through the cloud
   * console, the `appResolver` function would be invoked with the following
   * arguments:
   *    scriptPath: 'index.js'
   *    knownFiles: ['/x/y/src/index.js',
   *                 '/x/y/src/someDir/index.js',
   *                 '/x/y/src/util.js']
   *    resolved: ['/x/y/src/index.js',
   *               '/x/y/src/someDir/index.js']
   * This is because out of the known files, the files, '/x/y/src/index.js'
   * and '/x/y/src/someDir/index.js' end with 'index.js'.
   *
   * If the array `['/x/y/src/index.js', '/x/y/src/someDir/index.js']` or
   * equivalently `undefined` is returned by the `pathResolver` function, the
   * debug agent will not be able to set the breakpoint.
   *
   * If, however, the `pathResolver` function returned `['/x/y/src/index.js']`,
   * for example, the debug agent would know to set the breakpoint in
   * the `/x/y/src/index.js` file.
   */
  pathResolver?:
      (scriptPath: string, knownFiles: string[],
       resolved: string[]) => string[] | undefined;

  /**
   * agent log level 0-disabled, 1-error, 2-warn, 3-info, 4-debug
   */
  logLevel: number;

  /**
   * How frequently should the list of breakpoints be refreshed from the cloud
   * debug server.
   */
  breakpointUpdateIntervalSec: number;

  /**
   * breakpoints and logpoints older than this number of seconds will be expired
   * on the server.
   */
  breakpointExpirationSec: number;

  /**
   * configuration options on what is captured on a snapshot.
   */
  capture: {
    /**
     * Whether to include details about stack frames belonging to node-core.
     */
    includeNodeModules: boolean;

    /**
     * Maximum number of stack frames to capture data for. The limit is aimed to
     * reduce overall capture time.
     */
    maxFrames: number;

    /**
     * We collect locals and arguments on a few top frames. For the rest only
     * collect the source location
     */
    maxExpandFrames: number;

    /**
     * To reduce the overall capture time, limit the number of properties
     * gathered on large objects. A value of 0 disables the limit.
     */
    maxProperties: number;

    /**
     * Total 'size' of data to gather. This is NOT the number of bytes of data
     * that are sent over the wire, but instead a very very coarse approximation
     * based on the length of names and values of the properties. This should be
     * somewhat proportional to the amount of processing needed to capture the
     * data and subsequently the network traffic. A value of 0 disables the
     * limit.
     */
    maxDataSize: number;

    /**
     * To limit the size of the buffer, we truncate long strings. A value of 0
     * disables truncation.
     */
    maxStringLength: number;
  };

  /**
   * options affecting log points.
   */
  log: {
    /**
     * The maximum number of logs to record per second per logpoint.
     */
    maxLogsPerSecond: number;

    /**
     * Number of seconds to wait after the `maxLogsPerSecond` rate is hit before
     * logging resumes per logpoint.
     */
    logDelaySeconds: number;
  };

  /**
   * These configuration options are for internal  experimentation only.
   */
  internal: {
    registerDelayOnFetcherErrorSec: number; maxRegistrationRetryDelay: number;
  };

  /**
   * Used by tests to force loading of a new agent if one exists already
   */
  forceNewAgent_: boolean;

  /**
   * Uses by tests to cause the start() function to return the debuglet.
   */
  testMode_: boolean;

  /**
   * used to set a default api url
   */
  apiUrl?: string;
}

export interface StackdriverConfig extends GoogleAuthOptions {
  debug?: DebugAgentConfig;
}

export const defaultConfig: ResolvedDebugAgentConfig = {
  // FIXME(ofrobots): presently this is dependent what cwd() is at the time this
  // file is first required. We should make the default config static.
  workingDirectory: process.cwd(),
  allowRootAsWorkingDirectory: false,
  description: undefined,
  allowExpressions: false,

  // FIXME(ofrobots): today we prioritize GAE_MODULE_NAME/GAE_MODULE_VERSION
  // over the user specified config. We should reverse that.
  serviceContext:
      {service: undefined, version: undefined, minorVersion_: undefined},

  appPathRelativeToRepository: undefined,
  pathResolver: undefined,
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
