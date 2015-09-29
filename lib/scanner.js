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
var crypto = require('crypto');
var findit = require('findit');

module.exports = {
  scan: scan,
  findJSFiles: findJSFiles,
  computeHash: computeHash
};

function scan(baseDir, callback) {
  findJSFiles(baseDir, function(err, fileList) {
    if (err) {
      callback(err);
      return;
    }
    computeHash(fileList, function(err, hash) {
      callback(err, hash, fileList);
    });
  });
}

/**
 * This function accept an array of filenames and computes a unique hash-code
 * based on the contents.
 *
 * @param {!Array<string>} fileList array of filenames
 * @param {!function(?Error, string)} callback error-back style callback
 *    returning the hash-code.
 */
function computeHash(fileList, callback) {
  var pending = fileList.length;
  // return a valid, if fake, result when there are no js files to hash.
  if (pending === 0) {
    callback(null, 'EMPTY-no-js-files');
    return;
  }

  var hashes = [];
  fileList.forEach(function(filename) {
    hash(filename, function(err, digest) {
      if (err) {
        callback(err);
        return;
      }

      pending--;
      hashes.push(digest);

      if (pending === 0) {
        // Sort the hashes to get a deterministic order as the files may not
        // be in the same order each time we scan the disk.
        // TODO: it might be faster to sort if we had a binary hash instead
        // of a string.
        var buffer = hashes.sort().join();
        var sha1 = crypto.createHash('sha1').update(buffer).digest('hex');
        callback(null, 'SHA1-' + sha1);
      }
    });
  });
}


/**
 * Given a base-directory, this function scans the subtree and finds all the js
 * files. .git and node_module subdirectories are ignored.
 * @param {!string} baseDir top-level directory to scan
 * @param {!function(?Error, Array<string>)} callback error-back callback
 */
function findJSFiles(baseDir, callback) {
  var errored = false;

  if (!baseDir) {
    callback(new Error('hasher.findJSFiles requires a baseDir argument'));
    return;
  }

  var find = findit(baseDir);
  var fileList = [];

  find.on('error', function(err) {
    errored = true;
    callback(err);
    return;
  });

  find.on('directory', function(dir, stat, stop) {
    var base = path.basename(dir);
    if (base === '.git' || base === 'node_modules') {
      stop(); // do not descend
    }
  });

  find.on('file', function(file) {
    if (/\.js$/.test(file)) {
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
 * Compute a sha hash for the given file.
 * @param {string} filename
 * @param {function} cb errorback style callback which returns the sha string
 * @private
 */
function hash(filename, cb) {
  var shasum = crypto.createHash('sha1');
  var s = fs.ReadStream(filename);
  s.on('error', function(e) {
    cb(e);
  });
  s.on('data', function(d) {
    shasum.update(d);
  });
  s.on('end', function() {
    var d = shasum.digest('hex');
    cb(null, d);
  });
}
