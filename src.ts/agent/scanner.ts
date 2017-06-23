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

import * as crypto from 'crypto';
import * as findit from 'findit2';
import * as fs from 'fs';
import * as _ from 'lodash';
import * as path from 'path';
import * as split from 'split';

export interface FileStats {
  hash: string;
  lines: number;
}

export interface ScanStats { [filename: string]: FileStats; }

class ScanResults {
  private stats_: ScanStats;

  /**
   * Encapsulates the results of a filesystem scan with methods
   * to easily select scan information or filenames for a
   * specific subset of the files listed in the scan results.
   *
   * @param {Object} stats An object that contains filenames
   *  as keys where each key maps to an object containing the
   *  hash and number of lines for the specified file.  This
   *  information is accessed via the `hash` and `lines`
   *  attributes respectively
   * @constructor
   */
  constructor(stats: ScanStats) {
    this.stats_ = stats;
  }

  /**
   * Used to get all of the file scan results.
   */
  all(): ScanStats {
    return this.stats_;
  }

  /**
   * Used to get the file scan results for only the files
   * whose filenames match the specified regex.
   *
   * @param {regex} regex The regex that tests a filename
   *  to determine if the scan results for that filename
   *  should be included in the returned results.
   */
  selectStats(regex: RegExp): FileStats[] {
    // TODO: Typescript: Determine why {} is needed here
    return _.pickBy(this.stats_, function(_, key) {
      return regex.test(key);
    });
  }

  /**
   * Used to get the only the file paths in the scan results
   * where the filenames match the specified regex and are
   * returned with the each relative to the specified base
   * directory.
   *
   * @param {regex} regex The regex that tests a filename to
   *  determine if the scan results for that filename should
   *  be included in the returned results.
   * @param {string} baseDir The absolute path to the directory
   *  from which all of the returned paths should be relative
   *  to.
   */
  selectFiles(regex: RegExp, baseDir: string): string[] {
    // ensure the base directory has only a single trailing path separator
    baseDir = path.normalize(baseDir + path.sep);
    return Object.keys(this.stats_)
        .filter(function(file) {
          return file && regex.test(file);
        })
        .map(function(file) {
          return path.normalize(file).replace(baseDir, '');
        });
  }
}

export function scan(
    shouldHash: boolean, baseDir: string, regex: RegExp,
    callback: (err?: Error, results?: ScanResults, hash?: string) =>
        void): void {
  findFiles(baseDir, regex, function(err, fileList) {
    if (err) {
      callback(err);
      return;
    }
    computeStats(fileList, shouldHash, callback);
  });
}

/**
 * This function accept an array of filenames and computes a unique hash-code
 * based on the contents.
 *
 * @param {!Array<string>} fileList array of filenames
 * @param {Boolean} shouldHash whether a hash should be computed
 * @param {!function(?Error, ?string, Object)} callback error-back style callback
 *    returning the hash-code and an object containing file statistics.
 */
// TODO: Typescript: Fix the docs associated with this function to match the
// call signature
function computeStats(
    fileList: string[], shouldHash: boolean,
    callback: (err?: Error, results?: ScanResults, hash?: string) =>
        void): void {
  let pending = fileList.length;
  // return a valid, if fake, result when there are no js files to hash.
  if (pending === 0) {
    callback(null, new ScanResults({}), 'EMPTY-no-js-files');
    return;
  }

  const hashes: string[] = [];
  const statistics = {};
  fileList.forEach(function(filename) {
    stats(filename, shouldHash, function(err, fileStats) {
      if (err) {
        callback(err);
        return;
      }

      pending--;
      if (shouldHash) {
        hashes.push(fileStats.hash);
      }
      statistics[filename] = fileStats;

      if (pending === 0) {
        let hash;
        if (shouldHash) {
          // Sort the hashes to get a deterministic order as the files may not
          // be in the same order each time we scan the disk.
          const buffer = hashes.sort().join();
          const sha1 = crypto.createHash('sha1').update(buffer).digest('hex');
          hash = 'SHA1-' + sha1;
        }
        callback(null, new ScanResults(statistics), hash);
      }
    });
  });
}


/**
 * Given a base-directory, this function scans the subtree and finds all the js
 * files. .git and node_module subdirectories are ignored.
 * @param {!string} baseDir top-level directory to scan
 * @param {!regex} regex the regular expression that specifies the types of
 *  files to find based on their filename
 * @param {!function(?Error, Array<string>)} callback error-back callback
 */
function findFiles(
    baseDir: string, regex: RegExp,
    callback: (err?: Error, fileList?: string[]) => void): void {
  let errored = false;

  if (!baseDir) {
    callback(new Error('hasher.findJSFiles requires a baseDir argument'));
    return;
  }

  const find = findit(baseDir);
  const fileList: string[] = [];

  find.on('error', function(err) {
    errored = true;
    callback(err);
    return;
  });

  find.on('directory', function(dir, _, stop) {
    const base = path.basename(dir);
    if (base === '.git' || base === 'node_modules') {
      stop();  // do not descend
    }
  });

  find.on('file', function(file) {
    if (regex.test(file)) {
      fileList.push(file);
    }
  });

  find.on('end', function() {
    if (errored) {
      // the end event fires even after an error
      // simply return because the on('error') has already called back
      return;
    }
    callback(null, fileList);
  });
}

/**
 * Compute a sha hash for the given file and record line counts along the way.
 * @param {string} filename
 * @param {Boolean} shouldHash whether a hash should be computed
 * @param {function} cb errorback style callback which returns the sha string
 * @private
 */
function stats(
    filename: string, shouldHash: boolean,
    cb: (err, stats?: FileStats) => void): void {
  let shasum;
  if (shouldHash) {
    shasum = crypto.createHash('sha1');
  }
  // TODO: Determine why property 'ReadStream' does not exist on type 'fs'
  const s = (fs as any).ReadStream(filename);
  let lines = 0;
  const byLine = s.pipe(split());
  byLine.on('error', function(e) {
    cb(e);
  });
  byLine.on('data', function(d) {
    if (shouldHash) {
      shasum.update(d);
    }
    lines++;
  });
  byLine.on('end', function() {
    let d;
    if (shouldHash) {
      d = shasum.digest('hex');
    }
    cb(null, {hash: d, lines: lines});
  });
}
