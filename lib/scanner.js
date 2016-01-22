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

var SOURCE_MAP_REGEX = /\/\/# sourceMappingURL=(.*)/g;
var MAP_SOURCES_REGEX = /"sources":.*?(\[[\s|\S]*?\])/;

var logger;

module.exports = {
  scan: scan
};

function scan(shouldHash, baseDir, log, callback) {
  logger = log;
  findJSFiles(baseDir, function(err, fileList) {
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
function computeStats(fileList, shouldHash, callback) {
  var pending = fileList.length;
  // return a valid, if fake, result when there are no js files to hash.
  if (pending === 0) {
    callback(null, {}, 'EMPTY-no-js-files');
    return;
  }

  var hashes = [];
  var statistics = {
    compilationInfo: {}
  };
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
      for (var k in fileStats.compilationInfo) {
        if (statistics.compilationInfo[k]) {
          return callback(new Error('Unsupported: Single source file ' + k +
            ' detected in multiple targets ' + [statistics.compilationInfo[k].target,
            fileStats.compilationInfo[k].target]));
        }
        statistics.compilationInfo[k] = fileStats.compilationInfo[k];
      }

      if (pending === 0) {
        var hash;
        if (shouldHash) {
          // Sort the hashes to get a deterministic order as the files may not
          // be in the same order each time we scan the disk.
          var buffer = hashes.sort().join();
          var sha1 = crypto.createHash('sha1').update(buffer).digest('hex');
          hash = 'SHA1-' + sha1;
        }
        callback(null, statistics, hash);
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
 * Compute a sha hash for the given file and record line counts along the way.
 * @param {string} filename
 * @param {Boolean} shouldHash whether a hash should be computed
 * @param {function} cb errorback style callback taking an error, an object
 *   containing hash and line count, and an object mapping source files to their
 *   source map and compiled output.
 * @private
 */
function stats(filename, shouldHash, cb) {
  fs.readFile(filename, function(err, data) {
    if (err) {
      return cb(err);
    }
    var hash;
    if (shouldHash) {
      var shasum = crypto.createHash('sha1');
      shasum.update(data);
      hash = shasum.digest('hex');
    }
    var contents = data.toString();
    var lines = (contents.match(/\n/g) || []).length;
    var mapMatches = SOURCE_MAP_REGEX.exec(contents);
    if (!mapMatches || mapMatches.length < 2) {
      return cb(null, { hash: hash, lines: lines });
    }
    var sourceMapLine = mapMatches[1];
    var currDir = path.dirname(filename);
    var mapUrl = path.join(currDir, sourceMapLine);
    fs.readFile(mapUrl, 'utf8', function (err, mapContents) {
      if (err) {
        logger.warn('Error loading source map at ' + mapUrl);
        return cb(null, { hash: hash, lines: lines });
      }
      var compilationInfo = {};
      var sourceString = MAP_SOURCES_REGEX.exec(mapContents);
      if (sourceString && sourceString.length > 1) {
        var sources;
        try {
          sources = JSON.parse(sourceString[1]);
        } catch(e) {
          sources = [];
        }
        sources.forEach(function(source) {
          compilationInfo[path.join(currDir, source)] = {
            sourceMap: mapContents,
            target: filename
          };
        });
      }
      return cb(null, {
        hash: hash,
        lines: lines,
        compilationInfo: compilationInfo
      });
    });
  });
}
