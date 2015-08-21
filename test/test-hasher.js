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

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var fixtureDir = path.join(__dirname, './fixtures');
var fixture = function(file) {
  return path.join(fixtureDir, file);
};

describe('hasher', function() {
  var hasher = require('../lib/hasher.js');

  it('should complain when called without a path', function(done) {
    hasher.compute(null, function(err) {
      assert.ok(err);
      done();
    });
  });

  it('should error when called on a bad path', function(done) {
    hasher.compute('./this directory does not exist',
      function(err) {
        assert(err);
        done();
      });
  });

  it('should return the same hash if the files don\'t change',
   function(done) {
     hasher.compute(process.cwd(), function(err1, hash1) {
       assert.ifError(err1);
       hasher.compute(process.cwd(), function(err2, hash2) {
         assert.ifError(err2);
         assert.strictEqual(hash1, hash2);
         done();
       });
     });
  });

  it('should work with relative paths', function(done) {
    hasher.compute(fixtureDir, function(err, hash) {
      assert.ifError(err);
      assert.ok(hash);
      done();
    });
  });

  it('should return a valid hash even when there are no javascript files',
    function(done) {
      hasher.compute(fixture('nojs'), function(err, hash) {
        assert.ifError(err);
        assert.ok(hash);
        done();
      });
    });

  it('should return a different hash if the files contents change',
    function(done) {
      fs.writeFileSync(fixture('tmp.js'), '1 + 1');
      hasher.compute(fixtureDir, function(err1, hash1) {
        assert.ifError(err1);
        assert.ok(hash1);
        fs.writeFileSync(fixture('tmp.js'), '1 + 2');
        hasher.compute(fixtureDir, function(err2, hash2) {
          assert.ifError(err2);
          assert.ok(hash2);
          assert.notStrictEqual(hash1, hash2);
          fs.unlinkSync(fixture('tmp.js'));
          done();
        });
      });
    });
});
