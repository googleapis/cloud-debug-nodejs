// Copyright 2015 Google LLC
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

import * as assert from 'assert';

import * as utils from '../src/agent/util/utils';

describe('safeRequire', () => {
  it('should retrieve a loaded module', () => {
    const moduleName = require.resolve('./fixtures/hello.js');
    const hello1 = require(moduleName);
    const hello2 = utils.safeRequire(moduleName);
    assert.strictEqual(hello1, hello2);
  });

  it('should not load a valid but not yet loaded module', () => {
    const moduleName = require.resolve('./fixtures/foo.js');
    const foo = utils.safeRequire(moduleName);
    assert.strictEqual(foo, null);
  });

  it('should ignore requests to find missing modules', () => {
    const invalid = utils.safeRequire('invalid');
    assert.strictEqual(invalid, null);
  });
});
