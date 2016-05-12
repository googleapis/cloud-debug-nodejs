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
'use strict';

// Default configuration
module.exports = {
  debug: {
    enabled: true,
    workingDirectory: process.cwd(),

    // An identifier for the current code deployment.
    description: undefined,

    // The path within your repository to the directory containing the
    // package.json for your deployed application. This should be provided
    // if your deployed application appears as a subdirectory of your repository.
    appPathRelativeToRepository: undefined,

    // Log levels: 0-disabled,1-error,2-warn,3-info,4-debug.
    logLevel: 1,

    // How frequently should the list of breakpoints be refreshed from the
    // cloud debug server.
    breakpointUpdateIntervalSec: 10,

    // We expire stale breakpoints on the server.
    breakpointExpirationSec: 60 * 60 * 24, // 24 hours

    capture: {
      // Whether to include details about stack frames belonging to node-core.
      includeNodeModules: false,

      // Maximum number of stack frames to capture data for. The limit is aimed
      // to reduce overall capture time
      maxFrames: 20,

      // Only collect locals and arguments on a few top frames. For the rest
      // only collect the source location
      maxExpandFrames: 5,

      // To reduce the overall capture time, limit the number of properties
      // gathered on large object. A value of 0 disables the limit.
      maxProperties: 10,

      // Total 'size' of data to gather. This is NOT the number of bytes of data
      // that are sent over the wire, but instead a very very coarse approximation
      // based on the length of names and values of the properties. This should
      // be somewhat proportional to the amount of processing needed to capture
      // the data and subsequently the network traffic. A value of 0 disables the
      // limit.
      maxDataSize: 20000,

      // To limit the size of the buffer, we truncate long strings.
      // A value of 0 disables truncation.
      maxStringLength: 100
    },

    // These configuration options are for internal experimentation only.
    internal: {
      registerDelayOnFetcherErrorSec: 300 // 5 minutes.
    }
  }
};
