/**
 * Copyright 2015 Google Inc. All Rights Reserved.
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
// TODO: Determine how to not have a type declaration here.
const module: NodeModule = require('../..');
import * as nock from 'nock';
import * as nocks from './nocks';

nock.disableNetConnect();

describe('Debug module', function() {
  before(function(done) {
    nocks.projectId('project-via-metadata');
    // TODO: Determine how to remove this cast to any.
    const debuglet = (module as any).start({
      projectId: '0',
      debug: {forceNewAgent_: true, testMode_: true}
    });
    debuglet.on('started', function() {
      debuglet.stop();
      done();
    });
  });

  it('should throw on attempt to start a new agent', function() {
    // TODO: Determine how to remove this cast to any.
    assert.throws(function() {
      (module as any).start();
    });
  });

});
