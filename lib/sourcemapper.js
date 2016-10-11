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

/** @const */ var _ = require('lodash');
/** @const */ var fs = require('fs');
/** @const */ var path = require('path');
/** @const */ var sourceMap = require('source-map');
/** @const */ var polyfill = require('./polyfill.js');

/** @define {string} */ var MAP_EXT = '.map';

/**
 * @param {Array.<string>} sourcemapPaths An array of absolute paths to
 *  .map sourcemap files that should be processed
 * @param {Logger} logger A logger that reports errors that occurred while
 *  processing the given sourcemap files
 * @constructor
 */
function Sourcemapper(sourcemapPaths, logger) {
  this.infoMap = new Map();

  var that = this;
  _.forEach(sourcemapPaths, function(fullMapPath) {
    // this handles the case when the path is undefined, null, or
    // the empty string
    if (!fullMapPath || !polyfill.endsWith(fullMapPath, MAP_EXT)){
      return;
    }
    fullMapPath = path.normalize(fullMapPath);

    fs.readFile(path.normalize(fullMapPath), 'utf8',
      function(err, data) {
        if (err){
          logger.error('Could not read sourcemap file ' + fullMapPath +
                       ': ' + err);
          return;
        }

        try {
          var consumer = new sourceMap.SourceMapConsumer(data);

          /*
           * If the sourcemap file defines a "file" attribute, use it as
           * the output file where the path is relative to the directory
           * containing the map file.  Otherwise, use the name of the output
           * file (with the .map extension removed) as the output file.
           */
          var outputBase = consumer.file ? consumer.file
                                         : path.basename(fullMapPath, '.map'),
              parentDir = path.dirname(fullMapPath),
              outputPath = path.join(parentDir, outputBase);
          
          var sources = Array.prototype.slice.call(consumer.sources)
            .filter(function(value) {
              // filter out any empty string, null, or undefined sources
              return !!value;
            })
            .map(function(relPath) {
              // resolve the relative paths to absolute paths
              return path.join(parentDir, relPath);
            });

          if (sources.length === 0) {
            logger.error('No sources listed in the sourcemap file ' +
                         fullMapPath);
            return;
          }

          _.forEach(sources, function(src) {
            that.infoMap.set(path.normalize(src), {
              outputFile: outputPath,
              mapFile: fullMapPath,
              mapConsumer: consumer
            });
          });
        }
        catch(e) {
          logger.error('An error occurred while reading the '+
                       'sourcemap file ' + fullMapPath + ': ' + err);
        }
    });
  });
}

/**
 * Used to determine if the source file specified by the given path has
 * a .map file and an output file associated with it.
 * 
 * If there is no such mapping, it could be because the input file is not
 * the input to a transpilation process or it is the input to a transpilation
 * process but its corresponding .map file was not given to the constructor
 * of this mapper.
 * 
 * @param {string} inputPath The absolute path to an input file that could
 *  possibly be the input to a transpilation process
 */
Sourcemapper.prototype.hasMappingInfo = function(inputPath) {
  return this.infoMap.has(path.normalize(inputPath));
};

/**
 * @param {string} inputPath The absolute path to an input file that could
 *   possibly be the input to a transpilation process
 * @param {number} The line number in the input file where the line number is
 *   zero-based.
 * @param {number} (Optional) The column number in the line of the file
 *   specified where the column number is zero-based.
 * @return {Object} The object returned has a "file" attribute for the
 *   absolute path of the output file associated with the given input file,
 *   a "line" attribute of the line number in the output file associated with
 *   the given line number for the input file, and an optional "column" number
 *   of the column number of the output file associated with the given file
 *   and line information.
 * 
 *   If the given input file does not have mapping information associated
 *   with it then null is returned.
 */
Sourcemapper.prototype.mappingInfo = function(inputPath, lineNumber, colNumber) {
  inputPath = path.normalize(inputPath);
  if (!this.hasMappingInfo(inputPath)) {
    return null;
  }

  var entry = this.infoMap.get(inputPath);
  var sourcePos = {
    source: path.relative(path.dirname(entry.mapFile), inputPath),
    line: lineNumber + 1, // the SourceMapConsumer expects the line number 
                          // to be one-based but expects the column number 
    column: colNumber     // to be zero-based
  };

  var consumer = entry.mapConsumer;
  var allPos = consumer.allGeneratedPositionsFor(sourcePos);
  /*
   * Based on testing, it appears that the following code is needed to 
   * properly get the correct mapping information.
   * 
   * In particular, the generatedPositionFor() alone doesn't appear to 
   * give the correct mapping information.
   */
  var mappedPos = allPos && allPos.length > 0 ?
    Array.prototype.reduce.call(allPos,
      function(accumulator, value, index, arr) {
          return value.line < accumulator.line ? value : accumulator;
      }) : consumer.generatedPositionFor(sourcePos);

  return {
    file: entry.outputFile,
    line: mappedPos.line - 1, // convert the one-based line numbers returned 
                              // by the SourceMapConsumer to the expected 
                              // zero-based output.
    column: mappedPos.col     // SourceMapConsumer uses zero-based column 
                              // numbers which is the same as the expected 
                              // output
  };
};

module.exports = Sourcemapper;