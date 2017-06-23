/**
 *
 * Copyright 2015 Google Inc. All Rights Reserved.
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

import * as apiTypes from './types/api-types';

export class StatusMessage implements apiTypes.StatusMessage {
  refersTo: apiTypes.Reference;
  description: apiTypes.FormatMessage;
  isError: boolean;

  /**
   * Status Message to be sent to the server
   * @constructor
   */
  constructor(
      refersTo: apiTypes.Reference, description: string, isError: boolean) {
    this.refersTo = refersTo;
    this.description = {format: description};
    this.isError = isError;
  }

  // These status messages come from a proto definition.
  // New status messages cannot be added here.
  static readonly UNSPECIFIED: apiTypes.Reference = 'UNSPECIFIED';
  static readonly BREAKPOINT_SOURCE_LOCATION: apiTypes.Reference =
      'BREAKPOINT_SOURCE_LOCATION';
  static readonly BREAKPOINT_CONDITION: apiTypes.Reference =
      'BREAKPOINT_CONDITION';
  static readonly BREAKPOINT_EXPRESSION: apiTypes.Reference =
      'BREAKPOINT_EXPRESSION';
  static readonly VARIABLE_NAME: apiTypes.Reference = 'VARIABLE_NAME';
  static readonly VARIABLE_VALUE: apiTypes.Reference = 'VARIABLE_VALUE';
  static readonly BREAKPOINT_AGE: apiTypes.Reference = 'BREAKPOINT_AGE';
}
