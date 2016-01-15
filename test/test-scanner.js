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

var scanner = require('../lib/scanner.js');

describe('scanner', function() {

  describe('scan', function() {
    it('should complain when called without a path', function(done) {
      scanner.scan(true, null, function(err) {
        assert.ok(err);
        done();
      });
    });

    it('should error when called on a bad path', function(done) {
      scanner.scan(true, './this directory does not exist',
        function(err) {
          assert(err);
          done();
        });
    });

    it('should return the same hash if the files don\'t change',
     function(done) {
       scanner.scan(true, process.cwd(), function(err1, filesStats1, hash1) {
         var files1 = Object.keys(filesStats1);
         assert.ifError(err1);
         scanner.scan(true, process.cwd(), function(err2, filesStats2, hash2) {
          var files2 = Object.keys(filesStats2);
          assert.ifError(err2);
          assert.deepEqual(files1.sort(), files2.sort());
          assert.strictEqual(hash1, hash2);
          done();
         });
       });
    });

    it('should return undefined hash if shouldHash is false',
     function(done) {
       scanner.scan(false, process.cwd(), function(err, filesStats, hash) {
         assert.ifError(err);
         assert(!hash);
         done();
       });
    });

    it('should work with relative paths', function(done) {
      scanner.scan(true, fixtureDir, function(err, fileStats, hash) {
        var files = Object.keys(fileStats);
        assert.ifError(err);
        assert.ok(hash);
        assert.ok(files.length !== 0);
        done();
      });
    });

    it('should return a valid hash even when there are no javascript files',
      function(done) {
        scanner.scan(true, fixture('nojs'), function(err, fileStats, hash) {
          var files = Object.keys(fileStats);
          assert.ifError(err);
          assert.ok(hash);
          assert.ok(files.length === 0);
          done();
        });
      });

    it('should return a different hash if the files contents change',
      function(done) {
        fs.writeFileSync(fixture('tmp.js'), '1 + 1');
        scanner.scan(true, fixtureDir, function(err1, filesStats1, hash1) {
          var files1 = Object.keys(filesStats1);
          assert.ifError(err1);
          assert.ok(hash1);
          fs.writeFileSync(fixture('tmp.js'), '1 + 2');
          scanner.scan(true, fixtureDir, function(err2, filesStats2, hash2) {
            var files2 = Object.keys(filesStats2);
            assert.ifError(err2);
            assert.ok(hash2);
            assert.notStrictEqual(hash1, hash2);
            assert.deepEqual(files1.sort(), files2.sort());
            fs.unlinkSync(fixture('tmp.js'));
            done();
          });
        });
      });

    it('should return an updated file list when file list changes',
      function(done) {
        scanner.scan(true, fixtureDir, function(err1, fileStats1, hash1) {
          var files1 = Object.keys(fileStats1);
          assert.ifError(err1);
          assert.ok(hash1);
          fs.writeFileSync(fixture('tmp.js'), ''); // empty.
          scanner.scan(true, fixtureDir, function(err2, fileStats2, hash2) {
            var files2 = Object.keys(fileStats2);
            assert.ifError(err2);
            assert.ok(hash2);
            assert.notStrictEqual(hash1, hash2);
            assert.ok(files1.length === files2.length - 1);
            fs.unlinkSync(fixture('tmp.js'));
            scanner.scan(true, fixtureDir, function(err3, fileStats3, hash3) {
              var files3 = Object.keys(fileStats3);
              assert.ifError(err3);
              assert.ok(hash3);
              assert.strictEqual(hash1, hash3);
              assert.deepEqual(files1.sort(), files3.sort());
              done();
            });
          });
        });
      });
  });
});
