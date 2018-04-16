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

import * as realAssert from 'assert';

export interface FakeAssert {
  deepEqual: Function;
  deepStrictEqual: Function;
  doesNotThrow: Function;
  equal: Function;
  fail: Function;
  ifError: Function;
  notDeepEqual: Function;
  notDeepStrictEqual: Function;
  notEqual: Function;
  notStrictEqual: Function;
  ok: Function;
  strictEqual: Function;
  throws: Function;
  AssertionError: Function;
  rejects: Function;
  doesNotReject: Function;
  strict: Function;
}

const nop = (_: {}) => _;

const fakeAssert: FakeAssert = {
  deepEqual: nop,
  deepStrictEqual: nop,
  doesNotThrow: nop,
  equal: nop,
  fail: nop,
  ifError: nop,
  notDeepEqual: nop,
  notDeepStrictEqual: nop,
  notEqual: nop,
  notStrictEqual: nop,
  ok: nop,
  strictEqual: nop,
  throws: nop,
  AssertionError: nop,
  rejects: nop,
  doesNotReject: nop,
  strict: nop
};

export function debugAssert(enableAssertions: boolean): FakeAssert {
  // The typecast is needed since the @types/node doesn't cover Node 10 yet
  return enableAssertions ? realAssert as {} as FakeAssert : fakeAssert;
}
