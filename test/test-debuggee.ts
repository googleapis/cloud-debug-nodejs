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

import * as assert from 'assert';
import {Debuggee} from '../src/debuggee';

const agentVersion = `SomeName/client/SomeVersion`;

describe('Debuggee', () => {
  it('should create a Debuggee instance on valid input', () => {
    const debuggee = new Debuggee({
      project: 'project',
      uniquifier: 'uid',
      description: 'unit test',
      agentVersion
    });
    assert.ok(debuggee instanceof Debuggee);
  });

  it('should create a Debuggee on a call without new', () => {
    const debuggee = new Debuggee({
      project: 'project',
      uniquifier: 'uid',
      description: 'unit test',
      agentVersion
    });
    assert.ok(debuggee instanceof Debuggee);
  });

  it('should throw on invalid input', () => {
    assert.throws(() => {
      return new Debuggee({agentVersion});
    });
    assert.throws(() => {
      return new Debuggee({project: '5', agentVersion});
    });
    assert.throws(() => {
      return new Debuggee({project: undefined, agentVersion});
    });
    assert.throws(() => {
      return new Debuggee({project: 'test', agentVersion});
    });
    assert.throws(() => {
      const _ =
          new Debuggee({project: 'test', uniquifier: undefined, agentVersion});
      assert.throws(() => {
        return new Debuggee({project: 'test', uniquifier: 'uid', agentVersion});
      });
    });
  });
});
