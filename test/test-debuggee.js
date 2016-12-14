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
'use strict';

var assert = require('assert');
var Debuggee = require('../src/debuggee.js');

describe('Debuggee', function() {

  it('should create a Debuggee instance on valid input', function() {
    var debuggee = new Debuggee('project', 'uid');
    assert.ok(debuggee instanceof Debuggee);
  });

  it('should create a Debuggee on a call without new', function() {
    var debuggee = Debuggee('project', 'uid');
    assert.ok(debuggee instanceof Debuggee);
  });

  it('should throw on invalid input', function() {
    assert.throws(function() { new Debuggee(); });
    assert.throws(function() { new Debuggee(5); });
    assert.throws(function() { new Debuggee(undefined); });
    assert.throws(function() { new Debuggee('test'); });
    assert.throws(function() { new Debuggee('test', null); });
  });

  it('should have sensible labels', function() {
    var debuggee = new Debuggee('some project', 'id', {
      service: 'some-service',
      version: 'production'
    });
    assert.ok(debuggee);
    assert.ok(debuggee.labels);
    assert.strictEqual(debuggee.labels.module, 'some-service');
    assert.strictEqual(debuggee.labels.version, 'production');
  });

  it('should not add a module label when service is default', function() {
    var debuggee = new Debuggee('fancy-project', 'very-unique',
                                {service: 'default', version: 'yellow.5'});
    assert.ok(debuggee);
    assert.ok(debuggee.labels);
    assert.strictEqual(debuggee.labels.module, undefined);
    assert.strictEqual(debuggee.labels.version, 'yellow.5');
  });

  it('should have an error statusMessage with the appropriate arg', function() {
    var debuggee = new Debuggee('a', 'b', undefined, undefined, undefined,
                                'Some Error Message');
    assert.ok(debuggee);
    assert.ok(debuggee.statusMessage);
  });

});
