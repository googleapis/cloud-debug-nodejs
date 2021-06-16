// Copyright 2016 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as fs from 'fs';
import pLimit = require('p-limit');
import * as path from 'path';
import {promisify} from 'util';
import * as sourceMap from 'source-map';

import {Logger} from '../config';
import {findScriptsFuzzy} from '../util/utils';

const CONCURRENCY = 10;
const WEBPACK_PREFIX = 'webpack://';
const readFilep = promisify(fs.readFile);

/** @define {string} */ const MAP_EXT = '.map';

/** Represents one source map file. */
export interface MapInfoInput {
  // The path of generated output file in the source map. For example, if
  // "src/index1.ts" and "src/index2.ts" are generated into "dist/index.js" and
  // "dist/index.js.map", then this field is "dist/index.js (relative to the
  // process's working directory).
  outputFile: string;

  // The source map's path (relative to the process's working directory). For
  // the same example above, this field is "dist/index.js.map".
  mapFile: string;

  // The SourceMapConsumer object after parsing the content in the mapFile.
  mapConsumer: sourceMap.SourceMapConsumer;

  // The original sources in the source map. Each value is relative to the
  // source map file. For the same example above, this field is
  // ['../src/index1.ts', '../src/index2.ts']. the sources are in ascending
  // order from shortest to longest.
  sources: string[];
}

export interface MapInfoOutput {
  file: string;
  line: number;
  column?: number;
}

export class MultiFileMatchError implements Error {
  readonly name = 'MultiFileMatchError';
  readonly message = 'Error: matching multiple files';
  constructor(readonly files: string[]) {}
}

/**
 * @param {!Map} infoMap The map that maps input source files to
 *  SourceMapConsumer objects that are used to calculate mapping information
 * @param {string} mapPath The path to the sourcemap file to process.  The
 *  path should be relative to the process's current working directory
 * @private
 */
async function processSourcemap(
  infoMap: Map<string, MapInfoInput>,
  mapPath: string
) {
  // this handles the case when the path is undefined, null, or
  // the empty string
  if (!mapPath || !mapPath.endsWith(MAP_EXT)) {
    throw new Error(`The path ${mapPath} does not specify a sourcemap file`);
  }
  mapPath = path.normalize(mapPath);

  let rawSourceMapString;
  try {
    rawSourceMapString = await readFilep(mapPath, 'utf8');
  } catch (e) {
    throw new Error('Could not read sourcemap file ' + mapPath + ': ' + e);
  }

  let rawSourceMap;
  try {
    rawSourceMap = JSON.parse(rawSourceMapString);
  } catch (e) {
    throw new Error('Could not parse the raw sourcemap ' + mapPath + ': ' + e);
  }

  let consumer: sourceMap.SourceMapConsumer;
  try {
    consumer = await new sourceMap.SourceMapConsumer(rawSourceMapString);
  } catch (e) {
    throw new Error(
      'An error occurred while reading the ' +
        'sourcemap file ' +
        mapPath +
        ': ' +
        e
    );
  }

  /*
   * If the sourcemap file defines a "file" attribute, use it as
   * the output file where the path is relative to the directory
   * containing the map file.  Otherwise, use the name of the output
   * file (with the .map extension removed) as the output file.
   */
  const outputBase = rawSourceMap.file
    ? rawSourceMap.file
    : path.basename(mapPath, '.map');
  const parentDir = path.dirname(mapPath);
  const outputPath = path.normalize(path.join(parentDir, outputBase));

  // The paths of the sources that are relative to the source map file. Sort
  // them in ascending order from shortest to longest.
  // For webpack file path, normalize the path after the webpack prefix so that
  // the source map library can recognize it.
  const sourcesRelToSrcmap = rawSourceMap.sources
    .filter((val: string) => !!val)
    .map((val: string) => {
      if (val.toLowerCase().startsWith(WEBPACK_PREFIX)) {
        return (
          WEBPACK_PREFIX +
          path.normalize(val.substr(WEBPACK_PREFIX.length)).replace(/\\/g, '/')
        );
      }
      return val;
    })
    .sort((src1: string, src2: string) => src1.length - src2.length);

  // The paths of the sources that are relative to the current process's working
  // directory. These are the ones that are used for the fuzzy search (thus are
  // platform specific, e.g. using '\\' on Windows and using '/' in Unix, etc.).
  // For webpack file path, the prefix is filtered out for better fuzzy search
  // result.
  const normalizedSourcesRelToProc = sourcesRelToSrcmap
    .map((src: string) => {
      if (src.toLowerCase().startsWith(WEBPACK_PREFIX)) {
        return src.substring(WEBPACK_PREFIX.length);
      }
      return src;
    })
    .map((relPath: string) => {
      // resolve the paths relative to the map file so that they are relative to
      // the process's current working directory
      return path.normalize(path.join(parentDir, relPath));
    });

  if (normalizedSourcesRelToProc.length === 0) {
    throw new Error('No sources listed in the sourcemap file ' + mapPath);
  }

  for (const src of normalizedSourcesRelToProc) {
    infoMap.set(path.normalize(src), {
      outputFile: outputPath,
      mapFile: mapPath,
      mapConsumer: consumer,
      sources: sourcesRelToSrcmap,
    });
  }
}

export class SourceMapper {
  /** Maps each original source path to the corresponding source map info. */
  infoMap: Map<string, MapInfoInput>;

  constructor(readonly logger: Logger) {
    this.infoMap = new Map();
  }

  /**
   * Used to get the information about the transpiled file from a given input
   * source file provided there isn't any ambiguity with associating the input
   * path to exactly one output transpiled file.
   *
   * If there are more than one matches, throw the error to include all the
   * matched candidates.
   *
   * If there is no such mapping, it could be because the input file is not
   * the input to a transpilation process or it is the input to a transpilation
   * process but its corresponding .map file was not given to the constructor of
   * this mapper.
   *
   * @param inputPath The path to an input file that could possibly be the input
   *     to a transpilation process.
   *  The path can be relative to the process's current working directory.
   * @return The `MapInfoInput` object that describes the transpiled file
   *  associated with the specified input path. `null` is returned if there is
   *  no files that are associated with the input path.
   */
  getMapInfoInput(inputPath: string): MapInfoInput | null {
    if (this.infoMap.has(path.normalize(inputPath))) {
      return this.infoMap.get(inputPath) as MapInfoInput;
    }

    const matches = findScriptsFuzzy(
      inputPath,
      Array.from(this.infoMap.keys())
    );

    this.logger.debug(`sourcemapper fuzzy matches: ${matches}`);

    if (matches.length === 1) {
      return this.infoMap.get(matches[0]) as MapInfoInput;
    }
    if (matches.length > 1) {
      throw new MultiFileMatchError(matches);
    }

    return null;
  }

  /**
   * @param {string} inputPath The path to an input file that could possibly
   *  be the input to a transpilation process.  The path should be relative to
   *  the process's current working directory
   * @param {number} The line number in the input file where the line number is
   *   zero-based.
   * @param {number} (Optional) The column number in the line of the file
   *   specified where the column number is zero-based.
   * @return {Object} The object returned has a "file" attribute for the
   *   path of the output file associated with the given input file (where the
   *   path is relative to the process's current working directory),
   *   a "line" attribute of the line number in the output file associated with
   *   the given line number for the input file, and an optional "column" number
   *   of the column number of the output file associated with the given file
   *   and line information.
   *
   *   If the given input file does not have mapping information associated
   *   with it then null is returned.
   */
  getMapInfoOutput(
    inputPath: string,
    lineNumber: number,
    colNumber: number,
    entry: MapInfoInput
  ): MapInfoOutput | null {
    this.logger.debug(`sourcemapper inputPath: ${inputPath}`);

    inputPath = path.normalize(inputPath);

    const relPath = path
      .relative(path.dirname(entry.mapFile), inputPath)
      .replace(/\\/g, '/');

    /**
     * Note: Since `entry.sources` is in ascending order from shortest
     *       to longest, the first source path that ends with the
     *       relative path is necessarily the shortest source path
     *       that ends with the relative path.
     */
    let source: string | undefined;
    for (const src of entry.sources) {
      if (src.endsWith(relPath)) {
        source = src;
        break;
      }
    }

    const sourcePos = {
      source: source || relPath,
      line: lineNumber + 1, // the SourceMapConsumer expects the line number
      // to be one-based but expects the column number
      column: colNumber, // to be zero-based
    };

    this.logger.debug(`sourcemapper sourcePos: ${JSON.stringify(sourcePos)}`);

    const allPos = entry.mapConsumer.allGeneratedPositionsFor(sourcePos);
    /*
     * Based on testing, it appears that the following code is needed to
     * properly get the correct mapping information.
     *
     * In particular, the generatedPositionFor() alone doesn't appear to
     * give the correct mapping information.
     */
    const mappedPos: sourceMap.NullablePosition =
      allPos && allPos.length > 0
        ? allPos.reduce((accumulator, value) => {
            return (value.line ?? 0) < (accumulator.line ?? 0)
              ? value
              : accumulator;
          })
        : entry.mapConsumer.generatedPositionFor(sourcePos);

    this.logger.debug(`sourcemapper mappedPos: ${JSON.stringify(mappedPos)}`);

    return {
      file: entry.outputFile,
      line: (mappedPos.line ?? 0) - 1, // convert the one-based line numbers returned
      // by the SourceMapConsumer to the expected
      // zero-based output.
      // TODO: The `sourceMap.Position` type definition has a `column`
      //       attribute and not a `col` attribute.  Determine if the type
      //       definition or this code is correct.
      column: (mappedPos as {} as {col: number}).col, // SourceMapConsumer uses
      // zero-based column
      // numbers which is the
      // same as the expected
      // output
    };
  }

  /** Prints the debugging information of the source mapper to the logger. */
  debug() {
    this.logger.debug('Printing source mapper debugging information ...');
    for (const [key, value] of this.infoMap) {
      this.logger.debug(`  source ${key}:`);
      this.logger.debug(`    outputFile: ${value.outputFile}`);
      this.logger.debug(`    mapFile: ${value.mapFile}`);
      this.logger.debug(`    sources: ${value.sources}`);
    }
  }
}

/**
 * @param {Array.<string>} sourcemapPaths An array of paths to .map sourcemap
 *  files that should be processed.  The paths should be relative to the
 *  current process's current working directory
 * @param {Logger} logger A logger that reports errors that occurred while
 *  processing the given sourcemap files
 */
export async function create(sourcemapPaths: string[], logger: Logger): Promise<SourceMapper> {
  const limit = pLimit(CONCURRENCY);
  const mapper = new SourceMapper(logger);
  const promises = sourcemapPaths.map(path =>
    limit(() => processSourcemap(mapper.infoMap, path))
  );
  try {
    await Promise.all(promises);
  } catch (err) {
    throw new Error(
      'An error occurred while processing the sourcemap files' + err
    );
  }
  mapper.debug();
  return mapper;
}
