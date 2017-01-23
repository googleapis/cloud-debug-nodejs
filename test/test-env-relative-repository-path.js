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

'use strict';

var path = require('path');

process.env.GCLOUD_PROJECT = 0;

var assert = require('assert');
var api;
var Debuglet = require('../src/agent/debuglet.js');
var debuglet;
var h = require('./fixtures/a/hello.js');

describe('repository relative paths', function() {

  before(function(done) {
    var debug = require('..')({projectId: 'fake-project'});
    var config = {
      appPathRelativeToRepository: path.join(path.sep, 'my', 'project', 'root')
    };
    debuglet = new Debuglet(debug, config);
    debuglet.start();
    setTimeout(function() {
      // Wait for v8debug api to initialize.
      api = debuglet.v8debug_;
      assert(api, 'v8 debug api was not initialized in time');
      done();
    }, 1500);
  });

  after(function() {
    assert.equal(api.numBreakpoints_(), 0,
      'there should be no breakpoints active');
    assert.equal(api.numListeners_(), 0,
      'there should be no listeners active');
    debuglet.stop();
  });

  it('should correctly substitute when provided', function(done) {
    var bp = {
      id: 0,
      location: {
        line: 3,
        path: path.join(path.sep, 'my', 'project', 'root', 'packages', 'debug',
          'test', 'fixtures', 'a', 'hello.js')
      }
    };
    api.set(bp, function(err) {
      assert.ifError(err);
      api.wait(bp, function(err) {
        assert.ifError(err);
        api.clear(bp);
        done();
      });
      process.nextTick(function() { h.hello(); });
    });
  });

});
