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

export interface AuthOptions {
  credentials?: {client_email: string; private_key: string;};
  keyFilename?: string;
  projectId?: string;
}

export interface ServiceConfig {
  baseUrl: string;
  scopes: string[];
}

// TODO: Make this more precise
export interface ServiceObjectConfig {
  parent: any;
  baseUrl: string;
  createMethod?: string;
  id?: string;
  methods?: any;
}

export interface Common {
  Service: new(config: ServiceConfig, options: AuthOptions) => any;
  ServiceObject: new(config: ServiceObjectConfig) => any;
  util: {
    // TODO: Make this more precise.
    normalizeArguments: (globalContext: any, localConfig: any, options?: any) =>
        any;
  };
}

export interface Logger {
  // TODO: Determine the correct signatures for these members
  error: (message: any, ...args: any[]) => void;
  warn: (message: any, ...args: any[]) => void;
  info: (message: any, ...args: any[]) => void;
  debug: (message: any, ...args: any[]) => void;
}
