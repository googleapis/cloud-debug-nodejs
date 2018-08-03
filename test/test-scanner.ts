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
import * as events from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as proxyquire from 'proxyquire';
import * as stream from 'stream';

const fixtureDir = path.join(__dirname, './fixtures');
const fixture = (file: string): string => {
  return path.join(fixtureDir, file);
};

import * as scanner from '../src/agent/io/scanner';

const COFFEE_FILES_REGEX = /^(.*\.js\.map)|(.*\.js)|(.*\.coffee)$/;

describe('scanner', () => {
  describe('scan', () => {
    it('should complain when called without a path', (done) => {
      // TODO: The second argument must be a string.  Fix that.
      scanner.scan(true, null!, /.js$/).catch(() => {
        done();
      });
    });

    it('should error when called on a bad path', (done) => {
      // TODO: Determine if the err parameter should be used.
      scanner.scan(true, './this directory does not exist', /.js$/)
          .catch((err) => {
            done();
          });
    });

    it('should ignore broken links', function(done) {
      if (process.platform === 'win32') {
        this.skip();
        return;
      }

      scanner.scan(true, fixture('broken-links'), /.*/).then((fileStats) => {
        assert.strictEqual(
            fileStats.selectFiles(/broken-link\.js/, '').length, 0);
        assert.strictEqual(
            fileStats.selectFiles(/intended-link\.js/, '').length, 0);
        done();
      });
    });

    it('should be able to return all file stats directly', (done) => {
      scanner.scan(true, fixture('coffee'), COFFEE_FILES_REGEX)
          .then((fileStats) => {
            const files = Object.keys(fileStats.all());
            assert.strictEqual(files.length, 3);
            done();
          });
    });

    it('should be able to filter to return all file stats', (done) => {
      scanner.scan(true, fixture('coffee'), COFFEE_FILES_REGEX)
          .then((fileStats) => {
            const files = fileStats.selectFiles(/.*$/, '');
            assert.strictEqual(files.length, 3);
            done();
          });
    });

    it('should be able to filter filenames', (done) => {
      scanner.scan(true, fixture('coffee'), /.*$/).then((fileStats) => {
        // TODO: `selectFiles` expects two parameters.  Determine if the
        //       the second parameter should be optional or (if not) the
        //       correct value is used here.
        const files = fileStats.selectFiles(/.js$/, '.');
        assert.strictEqual(files.length, 1);
        assert.ok(files[0], path.join(fixtureDir, 'coffee', 'transpile.js'));
        done();
      });
    });

    it('should be able to filter file stats', (done) => {
      scanner.scan(true, fixture('coffee'), /.*$/).then((fileStats) => {
        const stats = fileStats.selectStats(/.js$/);
        const keys = Object.keys(stats);
        assert.strictEqual(keys.length, 1);

        const first = stats[keys[0]];
        assert.ok(first!.hash);
        assert.ok(first!.lines);
        done();
      });
    });

    it('should return the same hash if the files don\'t change', (done) => {
      scanner.scan(true, process.cwd(), /.js$/).then((fileStats1) => {
        const files1 = Object.keys(fileStats1.all());
        scanner.scan(true, process.cwd(), /.js$/).then((fileStats2) => {
          const files2 = Object.keys(fileStats2.all());
          assert.deepStrictEqual(files1.sort(), files2.sort());
          assert.strictEqual(fileStats1.hash, fileStats2.hash);
          done();
        });
      });
    });

    it('should return undefined hash if shouldHash is false', (done) => {
      scanner.scan(false, process.cwd(), /.js$/).then((fileStats) => {
        assert(!fileStats.hash);
        done();
      });
    });

    it('should work with relative paths', (done) => {
      scanner.scan(true, fixtureDir, /.js$/).then((fileStats) => {
        const files = Object.keys(fileStats.all());
        assert.ok(fileStats.hash);
        assert.ok(files.length !== 0);
        done();
      });
    });

    it('should return a valid hash even when there are no javascript files',
       (done) => {
         scanner.scan(true, fixture('nojs'), /.js$/).then((fileStats) => {
           const files = Object.keys(fileStats.all());
           assert.ok(fileStats.hash);
           assert.ok(files.length === 0);
           done();
         });
       });

    it('should return a different hash if the files contents change',
       (done) => {
         fs.writeFileSync(fixture('tmp.js'), '1 + 1');
         scanner.scan(true, fixtureDir, /.js$/).then((fileStats1) => {
           const files1 = Object.keys(fileStats1.all());
           assert.ok(fileStats1.hash);
           fs.writeFileSync(fixture('tmp.js'), '1 + 2');
           scanner.scan(true, fixtureDir, /.js$/).then((fileStats2) => {
             const files2 = Object.keys(fileStats2.all());
             assert.ok(fileStats2.hash);
             assert.notStrictEqual(fileStats1.hash, fileStats2.hash);
             assert.deepStrictEqual(files1.sort(), files2.sort());
             fs.unlinkSync(fixture('tmp.js'));
             done();
           });
         });
       });

    it('should return an updated file list when file list changes', (done) => {
      scanner.scan(true, fixtureDir, /.js$/).then((fileStats1) => {
        const files1 = Object.keys(fileStats1.all());
        assert.ok(fileStats1.hash);
        fs.writeFileSync(fixture('tmp.js'), '');  // empty.
        scanner.scan(true, fixtureDir, /.js$/).then((fileStats2) => {
          const files2 = Object.keys(fileStats2.all());
          assert.ok(fileStats2.hash);
          assert.notStrictEqual(fileStats1.hash, fileStats2.hash);
          assert.ok(files1.length === files2.length - 1);
          fs.unlinkSync(fixture('tmp.js'));
          scanner.scan(true, fixtureDir, /.js$/).then((fileStats3) => {
            const files3 = Object.keys(fileStats3.all());
            assert.ok(fileStats2.hash);
            assert.strictEqual(fileStats1.hash, fileStats3.hash);
            assert.deepStrictEqual(files1.sort(), files3.sort());
            done();
          });
        });
      });
    });
  });

  describe('on errors', () => {
    const MOCKED_DIRECTORY = '!NOT_A_REAL_DIRECTORY!';
    const MOCKED_FILES: Array<{filename: string; error: string}> = [];
    for (let i = 1; i <= 2; i++) {
      const filename = `cannot-read-${i}.js`;
      MOCKED_FILES.push(
          {filename, error: `EACCES: permission denied, open ${filename}`});
    }
    let mockedScanner: {
      scan: (shouldHash: boolean, baseDir: string, regex: RegExp) =>
          Promise<scanner.ScanResults>
    };
    before(() => {
      mockedScanner = proxyquire('../src/agent/io/scanner', {
        findit2: (dir: string) => {
          if (dir === MOCKED_DIRECTORY) {
            const emitter = new events.EventEmitter();
            setImmediate(() => {
              for (const mock of MOCKED_FILES) {
                emitter.emit('file', mock.filename);
              }
              emitter.emit('end');
            });
            return emitter;
          }

          throw new Error(
              `'findit' should have been called with ` +
              `'${MOCKED_DIRECTORY}' but encountered '${dir}'`);
        },
        fs: {
          createReadStream: (filename: string) => {
            const rs = new stream.Readable();
            setImmediate(() => {
              let found = false;
              for (const mock of MOCKED_FILES) {
                if (mock.filename === filename) {
                  found = true;
                  rs.emit('error', new Error(mock.error));
                  break;
                }
              }
              assert.ok(
                  found,
                  `The file ${filename} should not be read ` +
                      `because it doesn't have a mock`);
            });
            return rs;
          }
        }
      });
    });

    it('should report errors on files that cannot be read', async () => {
      const files = await mockedScanner.scan(true, MOCKED_DIRECTORY, /.*/);
      const errors = files.errors();
      assert.strictEqual(errors.size, MOCKED_FILES.length);
      for (const mock of MOCKED_FILES) {
        assert.ok(errors.has(mock.filename));
        assert.strictEqual(errors.get(mock.filename)!.message, mock.error);
      }
    });
  });
});
