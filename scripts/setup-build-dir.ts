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

import * as path from 'path';
import * as pify from 'pify';
import * as rawMkdirp from 'mkdirp';
import * as rawNcp from 'ncp';

const mkdirp = pify(rawMkdirp);
const ncp = pify(rawNcp);

const TEST = 'test';
const SYSTEM_TEST = 'system-test';

// For the transpiled code:
// __dirname = <project root>/build/scripts/
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const BUILD_DIR = path.join(PROJECT_ROOT, 'build');

const INPUT_TYPES_DIR = path.join(PROJECT_ROOT, 'src', 'types');
const OUTPUT_TYPES_DIR = path.join(BUILD_DIR, 'src', 'types');

const INPUT_TEST_DIR = path.join(PROJECT_ROOT, TEST);
const INPUT_SYSTEM_TEST_DIR = path.join(PROJECT_ROOT, SYSTEM_TEST);

const OUTPUT_TEST_DIR = path.join(BUILD_DIR, TEST);
const OUTPUT_SYSTEM_TEST_DIR = path.join(BUILD_DIR, SYSTEM_TEST);

async function copyTypes(): Promise<void> {
  await mkdirp(OUTPUT_TYPES_DIR);
  await ncp(INPUT_TYPES_DIR, OUTPUT_TYPES_DIR);
}

async function setupUnitTests(): Promise<void> {
  await mkdirp(OUTPUT_TEST_DIR);
  await ncp(INPUT_TEST_DIR, OUTPUT_TEST_DIR);
}

async function setupSystemTests(): Promise<void> {
  await mkdirp(OUTPUT_SYSTEM_TEST_DIR);
  await ncp(INPUT_SYSTEM_TEST_DIR, OUTPUT_SYSTEM_TEST_DIR);
}

async function main(): Promise<void> {
  try {
    await copyTypes();
    await setupUnitTests();
    await setupSystemTests();
  }
  catch (e) {
    console.error(e);
    process.exit(1);
  }
}

main();
