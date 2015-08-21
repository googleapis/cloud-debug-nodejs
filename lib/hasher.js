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

/**
 * This module computes a hash-code of the javascript source code contained
 * in the directory. The hash-code is dependent on the contents of the js
 * source, so it can be used to detect changes to the source. The hash ignores
 * files the .git and node_module subdirectories.
 *
 * @param {!string} baseDir top-level directory to compute a hash for
 * @param {!function} callback errorback style callback with the string hash
 */
module.exports.compute = function(baseDir, callback) {
  var errored = false;

  if (!baseDir) {
    callback(new Error('hasher.compute requires a baseDir argument'));
    return;
  }

  var find = require('findit')(baseDir);
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

    var hashes = [];
    var pending = fileList.length;

    // return a valid, if fake, result when there are no js files to hash
    if (pending === 0) {
      callback(null, 'EMPTY-no-js-files');
      return;
    }

    fileList.forEach(function (filename) {
      hash(filename, function(err, digest) {
        if (err) {
          callback(err);
          return;
        }

        pending--;
        hashes.push(digest);
        if (pending === 0) {
          var buffer = '';

          // sort the hashes to get a deterministic order. Note that it is
          // faster to sort the hashes rather than filenames.
          // TODO: maybe it would be faster to sort if we were getting a
          // binary hash rather than a hex string.
          hashes.sort().forEach(function(h) {
            buffer += h;
          });

          var sha1 = crypto
                      .createHash('sha1')
                      .update(buffer)
                      .digest('hex');
          callback(null, 'SHA1-' + sha1);
        }
      });
    });
  });
};


/**
 * Compute a sha hash for the given file.
 * @param {string} filename
 * @param {function} cb errorback style callback which returns the sha string
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
