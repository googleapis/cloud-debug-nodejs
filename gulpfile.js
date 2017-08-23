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
const sources = ['src/**/*.ts'];
const unitTests = ['test/**/*.ts'];
const systemTests = ['system-test/**/*.ts'];
const allFiles = sources.concat(unitTests).concat(systemTests);

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
  const program = require('tslint').Linter.createProgram('./tsconfig.json');
  return gulp.src(sources)
    .pipe(tslint(
      {
        configuration: tslintPath,
        formatter: 'prose', program
      }))
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
            '.', {includeContent: false, sourceRoot: '../../src'}))
        .pipe(gulp.dest(`${outDir}/src`)),
    tsResult.js.pipe(gulp.dest(`${outDir}/src`))
  ]);
});

gulp.task('test.system.copy', () => {
  return gulp.src(['system-test/**/*.js'])
             .pipe(gulp.dest(`${outDir}/system-test`));
});

gulp.task('test.system.compile', ['compile', 'test.system.copy'], () => {
  const tsResult = gulp.src(systemTests)
                       .pipe(sourcemaps.init())
                       .pipe(ts.createProject(tsconfigPath)())
                       .on('error', onError);
  return merge([
    tsResult.js
        .pipe(sourcemaps.write(
            '.', {includeContent: false, sourceRoot: '../../system-test'}))
        .pipe(gulp.dest(`${outDir}/system-test`)),
    tsResult.js.pipe(gulp.dest(`${outDir}/system-test`))
  ]);
});

gulp.task('test.packagejson.copy', () => {
  return gulp.src(['package.json'])
             .pipe(gulp.dest(`${outDir}`));
});

gulp.task('test.unit.copy', () => {
  return gulp.src(['test/**/*.js'])
             .pipe(gulp.dest(`${outDir}/test`));
});

gulp.task('test.unit.compile', ['test.unit.copy', 'test.packagejson.copy', 'compile'], () => {
  const tsResult = gulp.src(unitTests)
                       .pipe(sourcemaps.init())
                       .pipe(ts.createProject(tsconfigPath)())
                       .on('error', onError);
  return merge([
    tsResult.js
        .pipe(sourcemaps.write(
            '.', {includeContent: false, sourceRoot: '../../test'}))
        .pipe(gulp.dest(`${outDir}/test`)),
    tsResult.js.pipe(gulp.dest(`${outDir}/test`))
  ]);
});

function runTests(withCoverage, cb) {
  var args = [path.join('.', 'bin', 'run-test.sh')];
  if (withCoverage) {
    args = args.concat('-c');
  }
  spawn('bash', args, {
    stdio : 'inherit'
  }).on('close', cb);
}

gulp.task('test.run', ['test.unit.compile', 'test.system.compile'], cb => {
  runTests(false, cb);
});

gulp.task('test.coverage.run', ['test.unit.compile', 'test.system.compile'], cb => {
  runTests(true, cb);
});

gulp.task('watch', () => {
  exitOnError = false;
  gulp.start(['test.compile']);
  // TODO: also run unit tests in a non-fatal way
  return gulp.watch(sources, ['test.compile']);
});

gulp.task('test', ['test.run', 'test.check-format', 'test.check-lint']);
gulp.task('test.coverage', ['test.coverage.run', 'test.check-format', 'test.check-lint']);
gulp.task('default', ['compile', 'test.unit.compile', 'test.system.compile']);
