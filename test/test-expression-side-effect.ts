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
import * as stackdriver from '../src/types/stackdriver';
const breakpointInFoo: stackdriver.Breakpoint = {
  id: 'fake-id-123',
  location: { path: 'build/test/test-expression-side-effect-code.js', line: 5 }
} as stackdriver.Breakpoint;



describe('expression side effect', () => {
  it('should have expression evaluated', (done) => {
    // this test makes sure that the necessary environment variables to enable
    // asserts are present during testing. Use run-tests.sh, or export
    // CLOUD_DEBUG_ASSERTIONS=1 to make sure this test passes.
    if (parseFloat(process.version) < 8) {
      done();
    }
    // const bp: stackdriver.Breakpoint = {id: breakpointInFoo.id, location: breakpointInFoo.location} as stackdriver.Breakpoint;
    done();

  });
});
