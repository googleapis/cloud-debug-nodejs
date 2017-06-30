/**
 * Copyright 2017 Google Inc. All Rights Reserved.
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

require('source-map-support').install();

const del = require('del');
const gulp = require('gulp');
const merge = require('merge2');
const sourcemaps = require('gulp-sourcemaps');
const spawn = require('child_process').spawn;
const ts = require('gulp-typescript');
const path = require('path');
const process = require('process');
const tslint = require('gulp-tslint');
const clangFormat = require('clang-format');
const format = require('gulp-clang-format');

const tsconfigPath = path.join(__dirname, 'tsconfig.json');
const tslintPath = path.join(__dirname, 'tslint.json');
const outDir = 'build';
const sources = ['src.ts/**/*.ts'];

let exitOnError = true;
function onError() {
  if (exitOnError) {
    process.exit(1);
  }
}

gulp.task('test.check-format', () => {
  return gulp.src(sources)
      .pipe(format.checkFormat('file', clangFormat))
      .on('warning', onError);
});

gulp.task('format', () => {
  return gulp.src(sources, {base: '.'})
      .pipe(format.format('file', clangFormat))
      .pipe(gulp.dest('.'));
});

gulp.task('test.check-lint', () => {
  return gulp.src(sources)
      .pipe(tslint(
          {configuration: tslintPath, formatter: 'verbose'}))
      .pipe(tslint.report())
      .on('warning', onError);
});

gulp.task('clean', () => {
  return del(['build']);
});

gulp.task('compile', () => {
  const tsResult = gulp.src(sources)
                       .pipe(sourcemaps.init())
                       .pipe(ts.createProject(tsconfigPath)())
                       .on('error', onError);
  return merge([
    tsResult.dts.pipe(gulp.dest(`${outDir}/types`)),
    tsResult.js
        .pipe(sourcemaps.write(
            '.', {includeContent: false, sourceRoot: '../../src.ts'}))
        .pipe(gulp.dest(`${outDir}/src`)),
    tsResult.js.pipe(gulp.dest(`${outDir}/src`))
  ]);
});

gulp.task('test.compile', ['compile'], () => {
  // TODO: Complete this when the test files have been converted
  //       to Typescript.
});

gulp.task('test.unit', ['compile'], cb => {
  spawn('bash', ['./bin/run-test.sh'], {
    stdio : 'inherit'
  }).on('close', cb);
});

gulp.task('watch', () => {
  exitOnError = false;
  gulp.start(['test.compile']);
  // TODO: also run unit tests in a non-fatal way
  return gulp.watch(sources, ['test.compile']);
});

gulp.task('test', ['test.unit', 'test.check-format', 'test.check-lint']);
gulp.task('default', ['compile']);