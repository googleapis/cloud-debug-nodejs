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

import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';

const fixtureDir = path.join(__dirname, './fixtures');
const fixture = function(file: string): string {
  return path.join(fixtureDir, file);
};

import * as scanner from '../src/agent/scanner';

describe('scanner', function() {

  describe('scan', function() {
    it('should complain when called without a path', function(done) {
      scanner.scan(true, null, /.js$/).catch(() => {
        done();
      });
    });

    it('should error when called on a bad path', function(done) {
      scanner.scan(true, './this directory does not exist', /.js$/).catch((err) => {
        done();
      }); 
    });

    it('should be able to return all file stats directly', function(done) {
      scanner.scan(true, fixture('coffee'), /.*$/)
      .then((fileStats) => {
        const files = Object.keys(fileStats.all());
        assert.strictEqual(files.length, 3);
        done();
      });
    });

    it('should be able to filter to return all file stats', function(done) {
      scanner.scan(true, fixture('coffee'), /.*$/).then(function(fileStats) {
        const files = fileStats.selectFiles(/.*$/, '');
        assert.strictEqual(files.length, 3);
        done();
      });
    });

    it('should be able to filter filenames', function(done) {
      scanner.scan(true, fixture('coffee'), /.*$/).then(function(fileStats) {
        // TODO: `selectFiles` expects two parameters.  Determine if the
        //       the second parameter should be optional or (if not) the
        //       correct value is used here.
        const files = fileStats.selectFiles(/.js$/, '.');
        assert.strictEqual(files.length, 1);
        assert.ok(files[0], path.join(fixtureDir, 'coffee', 'transpile.js'));
        done();
      });
    });

    it('should be able to filter file stats', function(done) {
      scanner.scan(true, fixture('coffee'), /.*$/).then(function(fileStats) {
        const stats = fileStats.selectStats(/.js$/);
        const keys = Object.keys(stats);
        assert.strictEqual(keys.length, 1);

        const first = stats[keys[0]];
        assert.ok(first.hash);
        assert.ok(first.lines);
        done();
      });
    });

    it('should return the same hash if the files don\'t change',
     function(done) {
       scanner.scan(true, process.cwd(), /.js$/).then(function(fileStats1) {
         const files1 = Object.keys(fileStats1.all());
         scanner.scan(true, process.cwd(), /.js$/).then(function(fileStats2) {
          const files2 = Object.keys(fileStats2.all());
          assert.deepEqual(files1.sort(), files2.sort());
          assert.strictEqual(fileStats1.hash, fileStats2.hash);
          done();
         });
       });
    });

    it('should return undefined hash if shouldHash is false',
     function(done) {
       scanner.scan(false, process.cwd(), /.js$/).then(function(fileStats) {
         assert(!fileStats.hash);
         done();
       });
    });

    it('should work with relative paths', function(done) {
      scanner.scan(true, fixtureDir, /.js$/).then(function(fileStats) {
        const files = Object.keys(fileStats.all());
        assert.ok(fileStats.hash);
        assert.ok(files.length !== 0);
        done();
      });
    });

    it('should return a valid hash even when there are no javascript files',
      function(done) {
        scanner.scan(true, fixture('nojs'), /.js$/).then(function(fileStats) {
          const files = Object.keys(fileStats.all());
          assert.ok(fileStats.hash);
          assert.ok(files.length === 0);
          done();
        });
      });

    it('should return a different hash if the files contents change',
      function(done) {
        fs.writeFileSync(fixture('tmp.js'), '1 + 1');
        scanner.scan(true, fixtureDir, /.js$/).then(function(fileStats1) {
          const files1 = Object.keys(fileStats1.all());
          assert.ok(fileStats1.hash);
          fs.writeFileSync(fixture('tmp.js'), '1 + 2');
          scanner.scan(true, fixtureDir, /.js$/).then(function(fileStats2) {
            const files2 = Object.keys(fileStats2.all());
            assert.ok(fileStats2.hash);
            assert.notStrictEqual(fileStats1.hash, fileStats2.hash);
            assert.deepEqual(files1.sort(), files2.sort());
            fs.unlinkSync(fixture('tmp.js'));
            done();
          });
        });
      });

    it('should return an updated file list when file list changes',
      function(done) {
        scanner.scan(true, fixtureDir, /.js$/).then(function(fileStats1) {
          const files1 = Object.keys(fileStats1.all());
          assert.ok(fileStats1.hash);
          fs.writeFileSync(fixture('tmp.js'), ''); // empty.
          scanner.scan(true, fixtureDir, /.js$/).then(function(fileStats2) {
            const files2 = Object.keys(fileStats2.all());
            assert.ok(fileStats2.hash);
            assert.notStrictEqual(fileStats1.hash, fileStats2.hash);
            assert.ok(files1.length === files2.length - 1);
            fs.unlinkSync(fixture('tmp.js'));
            scanner.scan(true, fixtureDir, /.js$/).then(function(fileStats3) {
              const files3 = Object.keys(fileStats3.all());
              assert.ok(fileStats2.hash);
              assert.strictEqual(fileStats1.hash, fileStats3.hash);
              assert.deepEqual(files1.sort(), files3.sort());
              done();
            });
          });
        });
      });
  });
});
