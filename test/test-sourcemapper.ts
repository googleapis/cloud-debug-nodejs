/*
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from 'assert';
import {describe, it} from 'mocha';
import * as path from 'path';

import * as sm from '../src/agent/io/sourcemapper';

import {MockLogger} from './mock-logger';

const BASE_PATH = path.join(__dirname, 'fixtures', 'sourcemapper');
const QUICK_MILLISECONDS = 300;

/**
 * @param {string} tool The name of the tool that was used to generate the
 *  given sourcemap data
 * @param {string} relativeMapFilePath The path to the sourcemap file of a
 *  transpilation to test
 * @param {string} relativeInputFilePath The path to the input file that was
 *  transpiled to generate the specified sourcemap file
 * @param {string} relativeOutputFilePath The path to the output file that was
 *  generated during the transpilation process that constructed the
 *  specified sourcemap file
 * @param {Array.<Array.<number, number>>} inToOutLineNums An array of arrays
 *  where each element in the array is a pair of numbers.  The first number
 *  in the pair is the line number from the input file and the second number
 *  in the pair is the expected line number in the corresponding output file
 *
 *  Note: The line numbers are zero-based
 */
function testTool(
  tool: string,
  relativeMapFilePath: string,
  relativeInputFilePath: string,
  relativeOutputFilePath: string,
  inToOutLineNums: number[][]
) {
  const mapFilePath = path.join(BASE_PATH, relativeMapFilePath);
  const inputFilePath = path.join(BASE_PATH, relativeInputFilePath);
  const outputFilePath = path.join(BASE_PATH, relativeOutputFilePath);

  describe('sourcemapper for tool ' + tool, () => {
    const logger = new MockLogger();
    let sourcemapper: sm.SourceMapper;

    it('for tool ' + tool + ' sourcemapper should be created correctly',
       async () => {
         const start = Date.now();
         sourcemapper = await sm.create([mapFilePath], logger);
         assert(
             Date.now() - start < QUICK_MILLISECONDS,
             'should create the SourceMapper quickly');

         // Verify if the debugging information is correctly printed.
         assert.notStrictEqual(
             logger.debugs[0].args[0].indexOf('debugging information ...'), -1);
         assert.notStrictEqual(logger.debugs[1].args[0].indexOf('source '), -1);
         assert.notStrictEqual(
             logger.debugs[2].args[0].indexOf('outputFile'), -1);
         assert.notStrictEqual(logger.debugs[3].args[0].indexOf('mapFile'), -1);
         assert.notStrictEqual(logger.debugs[4].args[0].indexOf('sources'), -1);
         assert.strictEqual(
             logger.debugs.length, sourcemapper.infoMap.size * 4 + 1);
       });

    it(
      'for tool ' +
        tool +
        ' it states that it has mapping info for files it knows about',
      done => {
        assert.notStrictEqual(
          sourcemapper.getMapInfoInput(inputFilePath),
          null,
          `The sourcemapper should have information about '${inputFilePath}'`
        );
        done();
      }
    );

    it(
      'for tool ' +
        tool +
        ' it states that it has mapping info for files with a path' +
        ' similar to a path it knows about',
      done => {
        assert.notStrictEqual(
          sourcemapper.getMapInfoInput(inputFilePath),
          null
        );
        const movedPath = path.join(
          '/some/other/base/dir/',
          relativeInputFilePath
        );
        assert.notStrictEqual(
          sourcemapper.getMapInfoInput(inputFilePath),
          null,
          `The sourcemapper should have information about paths similar to '${movedPath}'`
        );
        done();
      }
    );

    it(
      'for tool ' +
        tool +
        ' it states that it does not have mapping info for a file it ' +
        "doesn't recognize",
      done => {
        const invalidPath = inputFilePath + '_INVALID';
        assert.strictEqual(
          sourcemapper.getMapInfoInput(invalidPath),
          null,
          `The source mapper should not have information the path '${invalidPath}' it doesn't recognize`
        );
        done();
      }
    );

    const testLineMapping = (inputLine: number, expectedOutputLine: number) => {
      const mapInfoInput = sourcemapper.getMapInfoInput(inputFilePath);
      assert.notEqual(mapInfoInput, null);
      const info = sourcemapper.getMapInfoOutput(
        inputFilePath,
        inputLine,
        0,
        mapInfoInput!
      );

      // Verify if the debugging information is correctly printed.
      const debugsLength = logger.debugs.length;
      assert.notStrictEqual(
          logger.debugs[debugsLength - 3].args[0].indexOf(
              'sourcemapper inputPath:'),
          -1);
      assert.notStrictEqual(
          logger.debugs[debugsLength - 2].args[0].indexOf(
              'sourcemapper sourcePos: {'),
          -1);
      assert.notStrictEqual(
          logger.debugs[debugsLength - 1].args[0].indexOf(
              'sourcemapper mappedPos: {'),
          -1);

      assert.notStrictEqual(
        info,
        null,
        'The mapping info for file ' + inputFilePath + ' must be non-null'
      );
      assert.strictEqual(info!.file, outputFilePath);
      assert.strictEqual(
        info!.line,
        expectedOutputLine,
        ' invalid mapping for input line ' +
          inputLine +
          ' Expected: ' +
          expectedOutputLine +
          ', Found: ' +
          info!.line
      );
    };

    it('for tool ' + tool + ' it properly maps line numbers', done => {
      inToOutLineNums.forEach(inToOutPair => {
        testLineMapping(inToOutPair[0], inToOutPair[1]);
      });

      done();
    });
  });
}

testTool(
  'Babel',
  path.join('babel', 'out.js.map'),
  path.join('babel', 'in.js'),
  path.join('babel', 'out.js'),
  [
    [1, 14],
    [2, 15],
    [3, 16],
    [4, 17],
    [5, 18],
    [6, 19],
    [8, 21],
    [9, 22],
    [11, 24],
    [12, 26],
    [13, 27],
    [14, 30],
    [15, 31],
    [16, 32],
    [18, 36],
    [19, 37],
    [20, 38],
    [21, 39],
    [23, 42],
    [24, 43],
    [25, 44],
    [28, 50],
    [29, 53],
    [30, 56],
    [31, 58],
    [32, 60],
    [34, 64],
    [35, 65],
    [36, 66],
    [37, 67],
    [39, 70],
    [40, 71],
    [44, 78],
    [45, 81],
    [47, 83],
    [50, 85],
    [54, 88],
    [55, 89],
    [56, 90],
    [59, 93],
    [62, 99],
    [63, 102],
    [66, 105],
    [69, 108],
    [70, 109],
    [73, 112],
    [74, 113],
    [77, 116],
    [78, 117],
    [79, 118],
  ]
);

testTool(
  'Typescript',
  path.join('typescript', 'out.js.map'),
  path.join('typescript', 'in.ts'),
  path.join('typescript', 'out.js'),
  [
    [1, 5],
    [2, 6],
    [3, 9],
    [4, 10],
    [7, 12],
    [8, 13],
    [12, 17],
    [13, 19],
    [14, 20],
    [18, 24],
    [19, 25],
    [22, 27],
    [23, 28],
  ]
);

testTool(
  'Coffeescript',
  path.join('coffeescript', 'in.js.map'),
  path.join('coffeescript', 'in.coffee'),
  path.join('coffeescript', 'in.js'),
  [
    [1, 1],
    [2, 7],
    [3, 8],
    [4, 9],
    [6, 12],
    [7, 13],
    [9, 20],
    [10, 23],
    [11, 24],
    [13, 31],
    [15, 33],
    [17, 36],
    [19, 38],
    [20, 40],
    [21, 44],
  ]
);

testTool(
  'Webpack with Typescript',
  path.join('webpack-ts', 'out.js.map'),
  path.join('webpack-ts', 'in.ts_'),
  path.join('webpack-ts', 'out.js'),
  [
    [3, 93],
    [4, 94],
    [8, 97],
  ]
);
