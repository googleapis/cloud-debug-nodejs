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

var assert = require('assert');
var Debuglet = require('../../lib/debuglet.js');

describe('module', function() {
  var agent;

  before(function() {
    agent = require('../..');
    agent.start();
    assert.strictEqual(agent.start.wasSuccessful_, true);
  });

  it('should return the same agent on a second require', function() {
    var obj = require('../..');
    obj.start();
    assert(agent === obj);
  });

  // Some tests depend on this private property.
  it('should have a debuglet as the private property', function() {
    assert(agent.private_);

    // The private_ property needs to be a debuglet.
    assert(agent.private_ instanceof Debuglet);

    // Debuglet needs to be an EventEmitter.
    assert(agent.private_ instanceof require('events'));
  });

});

