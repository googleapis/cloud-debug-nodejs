/**
 * Copyright 2016 Google Inc. All Rights Reserved.
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

import * as nock from 'nock';

// In the future _=>true.
function accept(): true {
  return true;
}

// TODO: Determine if the type of `validator` is correct.
export function oauth2(validator?: (body: any) => boolean): nock.Scope {
  validator = validator || accept;
  return nock('https://accounts.google.com')
      .post('/o/oauth2/token', validator)
      .once()
      .reply(200, {
        refresh_token: 'hello',
        access_token: 'goodbye',
        expiry_date: new Date(9999, 1, 1)
      });
}

// TODO: Determine if the type of `validator` is correct.
export function register(validator?: (body: any) => boolean): nock.Scope {
  validator = validator || accept;
  return nock('https://clouddebugger.googleapis.com')
      .post('/v2/controller/debuggees/register', validator)
      .once()
      .reply(200);
}

export function projectId(reply: string): nock.Scope {
  return nock('http://metadata.google.internal')
      .get('/computeMetadata/v1/project/project-id')
      .once()
      .reply(200, reply);
}
