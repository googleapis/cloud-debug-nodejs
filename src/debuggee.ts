// Copyright 2016 Google LLC
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

import {PackageInfo} from './client/stackdriver/debug';
import {StatusMessage} from './client/stackdriver/status-message';

export declare type CanaryMode =
  | 'CANARY_MODE_UNSPECIFIED'
  | 'CANARY_MODE_ALWAYS_ENABLED'
  | 'CANARY_MODE_ALWAYS_DISABLED'
  | 'CANARY_MODE_DEFAULT_ENABLED'
  | 'CANARY_MODE_DEFAULT_DISABLED';

// TODO: Determine how to get this interface to satisfy both the code and the
// docs
//       In particular, the comments below state some of the properties are
//       required but the default properties in the code is {}
export interface DebuggeeProperties {
  project?: string;
  uniquifier?: string;
  description?: string;
  agentVersion: string;
  labels?: {
    [key: string]: string;
  };
  sourceContexts?: Array<{[key: string]: {}}>;
  statusMessage?: StatusMessage;
  packageInfo?: PackageInfo;
  canaryMode?: CanaryMode;
}

export class Debuggee {
  uniquifier?: string;
  description?: string;
  agentVersion?: string;
  sourceContexts?: Array<{[key: string]: {}}>;

  // Public to allow for testing
  project?: string;
  labels?: {
    [key: string]: string;
  };
  statusMessage?: StatusMessage;
  id!: string;
  // TODO: This doesn't seem to ever be set but is referenced in the
  //       debuglet.ts file.
  isDisabled?: boolean;
  isInactive?: boolean;
  canaryMode?: CanaryMode;

  /**
   * Creates a Debuggee service object.
   * @ref https://cloud.google.com/debugger/api/reference/rest/v2/Debuggee
   *
   * @param {object} properties - an object with properties to use for Debuggee
   *     initialization.
   * @param {object} properties.project - Google Cloud Project ID
   * @param {string} properties.uniquifier - Debuggee uniquifier within the
   *     project. Any string that identifies the application within the project
   *     can be used. Including environment and version or build IDs is
   *     recommended.
   * @param {string} properties.description - A user specified string identifying
   *     this debuggable instance.
   * @param {?string} properties.agentVersion - version ID of the agent. (default:
   *     the version of this module)
   * @param {?object} labels - a set of custom properties about the debuggee that
   *     are reported to the service.
   * @param {?array<object>} properties.sourceContexts
   * @param {?StatusMessage} properties.statusMessage - A error string to register
   *     this as an erroring debuggable instance. This is useful if we have a
   *     problem starting the debugger support, and want to report to the API so
   *     that the user has a way of noticing.
   *     TODO(ofrobots): has this been renamed to `status` in the API?
   */
  constructor(properties: DebuggeeProperties) {
    if (!(this instanceof Debuggee)) {
      return new Debuggee(properties);
    }

    properties = properties || {};

    if (typeof properties.project !== 'string') {
      throw new Error('properties.project must be a string');
    }
    if (typeof properties.uniquifier !== 'string') {
      throw new Error('properties.uniquifier must be a string');
    }
    if (typeof properties.description !== 'string') {
      throw new Error('properties.description must be a string');
    }

    this.project = properties.project;
    this.uniquifier = properties.uniquifier;
    this.description = properties.description;
    this.agentVersion = properties.agentVersion;
    this.canaryMode = properties.canaryMode;
    if (properties.labels) {
      this.labels = properties.labels;
    }
    if (properties.sourceContexts) {
      this.sourceContexts = properties.sourceContexts;
    }
    if (properties.statusMessage) {
      this.statusMessage = properties.statusMessage;
    }
  }
}
