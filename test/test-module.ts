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
import {before, describe, it} from 'mocha';
const m: NodeModule & {
  start: Function;
  get: () => Debuglet | undefined;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
} = require('../..');
import * as nock from 'nock';
import * as nocks from './nocks';
import {Debuglet} from '../src/agent/debuglet';

nock.disableNetConnect();

describe('Debug module', () => {
  before(done => {
    nocks.projectId('project-via-metadata');
    const debuglet = m.start({
      projectId: '0',
      debug: {forceNewAgent_: true, testMode_: true},
    });
    debuglet.on('started', () => {
      debuglet.stop();
      done();
    });
  });

  it('should throw on attempt to start a new agent', () => {
    assert.throws(() => {
      m.start();
    });
  });

  it('should return the agent via the get() method', () => {
    const agent = m.get();
    assert(agent, 'Expected to get the started agent');
    assert.strictEqual(agent!.config.projectId, '0');
  });
});

describe('Debug module without start() called', () => {
  it('get() should return `undefined`', () => {
    delete require.cache[require.resolve('../..')];
    const m: NodeModule & {
      start: Function;
      get: () => Debuglet | undefined;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
    } = require('../..');
    const agent = m.get();
    assert.strictEqual(
      agent,
      undefined,
      'Expected `undefined` since the agent was not started'
    );
  });
});
