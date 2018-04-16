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

import * as assert from 'assert';
import * as semver from 'semver';

const coercedVersion = semver.coerce(process.version);
const resolvedVersion = coercedVersion ? coercedVersion.version : process.version;
const node10Above = semver.satisfies(resolvedVersion, '>=10');

const describeFn = node10Above ? describe.skip : describe;

describeFn('state', () => {
  // Testing of state.js is driven through test-v8debugapi.js. There are
  // minimal unit tests here.

  it('should have assertions enabled', () => {
    const state = require('../src/agent/state/legacy-state');

    // this test makes sure that the necessary environment variables to enable
    // asserts are present during testing. Use run-tests.sh, or export
    // CLOUD_DEBUG_ASSERTIONS=1 to make sure this test passes.
    if (!process.env.CLOUD_DEBUG_ASSERTIONS) {
      console.log(
          'This test requires the enviornment variable ' +
          'CLOUD_DEBUG_ASSERTIONS to be set in order to pass');
    }
    assert.throws(() => {
      state.testAssert();
    });
  });
});
