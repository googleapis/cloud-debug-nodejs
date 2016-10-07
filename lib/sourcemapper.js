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

/** @define */ var MAP_EXT = '.map';

/**
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

Sourcemapper.prototype.hasMappingInfo = function(inputPath) {
  return this.infoMap.has(path.normalize(inputPath));
};

Sourcemapper.prototype.mappingInfo = function(inputPath, lineNumber, colNumber) {
  inputPath = path.normalize(inputPath);
  if (!this.hasMappingInfo(inputPath)) {
    return null;
  }

  var entry = this.infoMap.get(inputPath);
  var sourcePos = {
    source: path.relative(path.dirname(entry.mapFile), inputPath),
    line: lineNumber,
    column: colNumber
  };

  var mappedPos = entry.mapConsumer.generatedPositionFor(sourcePos);
  return {
    file: entry.outputFile,
    line: mappedPos.line,
    column: mappedPos.col
  };
};

module.exports = Sourcemapper;