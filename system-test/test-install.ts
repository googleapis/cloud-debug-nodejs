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

import * as assert from 'assert';
import * as path from 'path';

import {globP, ncpP, rimrafP, spawnP, tmpDirP, writeFileP} from './utils';

const INDEX_TS = 'index.ts';
const INDEX_JS = 'index.js';

const TS_CODE_ARRAY: CodeSample[] = [
  {
    code: `import * as debug from '@google-cloud/debug-agent';`,
    description: 'imports the module'
  },
  {
    code: `import * as debug from '@google-cloud/debug-agent';
debug.start();`,
    description: 'imports the module and starts without arguments'
  },
  {
    code: `import * as debug from '@google-cloud/debug-agent';
debug.start({ allowExpressions: true });`,
    description: 'imports the module and starts with {allowExpressions: true}'
  }
];

const JS_CODE_ARRAY: CodeSample[] = [
  {
    code: `require('@google-cloud/debug-agent').start()`,
    description: 'requires the module and starts without arguments'
  },
  {
    code: `require('@google-cloud/debug-agent').start({})`,
    description: 'requires the module and starts with {}'
  },
  {
    code: `require('@google-cloud/debug-agent').start({
  allowExpressions: true
})`,
    description: 'requires the module and stargs with {allowExpressions: true}'
  }
];

const TIMEOUT_MS = 2 * 60 * 1000;

const DEBUG = false;
function log(txt: string): void {
  if (DEBUG) {
    console.log(txt);
  }
}

const stdio = DEBUG ? 'inherit' : 'ignore';

interface CodeSample {
  code: string;
  description: string;
}

describe('Installation', () => {
  let installDir: string|undefined;
  beforeEach(async function() {
    this.timeout(TIMEOUT_MS);
    // This script assumes that you don't already have a TGZ file
    // in your current working directory.
    installDir = await tmpDirP();
    log(`Using installation directory: ${installDir}`);
    await spawnP('npm', ['install'], {stdio}, log);
    await spawnP('npm', ['run', 'compile'], {stdio}, log);
    await spawnP('npm', ['pack'], {stdio}, log);
    const tgz = await globP(`${process.cwd()}/*.tgz`);
    if (tgz.length !== 1) {
      throw new Error(
          `Expected 1 tgz file in current directory, but found ${tgz.length}`);
    }
    await spawnP('npm', ['init', '-y'], {cwd: installDir, stdio}, log);
    await spawnP(
        'npm', ['install', 'typescript', '@types/node', tgz[0]],
        {cwd: installDir, stdio}, log);
  });

  afterEach(async function() {
    this.timeout(TIMEOUT_MS);
    if (installDir) {
      await rimrafP(installDir);
    }
  });

  describe('When used with Typescript code', () => {
    TS_CODE_ARRAY.forEach((sample) => {
      it(`should install and work with code that ${sample.description}`,
         async function() {
           this.timeout(TIMEOUT_MS);
           assert(installDir);
           await writeFileP(
               path.join(installDir!, INDEX_TS), sample.code, 'utf-8');
           await spawnP(
               `node_modules${path.sep}.bin${path.sep}tsc`, [INDEX_TS],
               {cwd: installDir, stdio}, log);
           await spawnP('node', [INDEX_JS], {cwd: installDir, stdio}, log);
         });
    });
  });

  describe('When used with Javascript code', () => {
    JS_CODE_ARRAY.forEach((sample) => {
      it(`should install and work with code that ${sample.description}`,
         async function() {
           this.timeout(TIMEOUT_MS);
           assert(installDir);
           await writeFileP(
               path.join(installDir!, INDEX_JS), sample.code, 'utf-8');
           await spawnP('node', [INDEX_JS], {cwd: installDir, stdio}, log);
         });
    });
  });
});
