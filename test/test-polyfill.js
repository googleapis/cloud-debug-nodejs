/*
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var assert = require('assert');
var polyfill = require('../lib/polyfill.js');

describe('endsWith', function(){
  it('works with typical input that ends with the given text',
    function(done){
      assert.strictEqual(polyfill.endsWith('some text', 'text'), true);
      done();
    });

  it('works with typical input that does not end with the given text',
    function(done){
      assert.strictEqual(polyfill.endsWith('some text', 'some'), false);
      done();
    });
  
  it('works with an empty expected text in a non-empty string',
    function(done){
      assert.strictEqual(polyfill.endsWith('some text', ''), true);
      done();
    });

  it('works with a non-empty expected text in an empty string',
    function(done){
      assert.strictEqual(polyfill.endsWith('', 'text'), false);
      done();
    });
  
  it('works with whitespace',
    function(done){
      assert.strictEqual(polyfill.endsWith('some text', '  text'), false);
      assert.strictEqual(polyfill.endsWith('some text', ' text'), true);
      assert.strictEqual(polyfill.endsWith('   ', '     '), false);
      assert.strictEqual(polyfill.endsWith('     ', '   '), true);
      done();
    });

  it('works with non-ASCII characters',
    function(done){
      assert.strictEqual(polyfill.endsWith('这个很好', '很好'), true);
      assert.strictEqual(polyfill.endsWith('这个很好', '不好'), false);
      done();
    });
  
   it('throws an error if the suffix is null or undefined',
    function(done){
      assert.throws(function(){
        polyfill.endsWith('some text', null);
      }, TypeError);
      assert.throws(function(){
        polyfill.endsWith('some text', undefined);
      }, TypeError);
      done();
    });

  it('throws an error if the target text is null or undefined',
    function(done){
      assert.throws(function(){
        polyfill.endsWith(null, 'a');
      }, TypeError);
      assert.throws(function(){
        polyfill.endsWith(undefined, 'a');
      }, TypeError);
      done();
    });
  
  it('is case sensitive',
    function(done){
      assert.strictEqual(polyfill.endsWith('some text', 'TEXT'), false);
      done();
    });
});