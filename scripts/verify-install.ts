
import * as assert from 'assert';
import * as path from 'path';
import { globP, ncpP, spawnP, tmpDirP, writeFileP, rimrafP } from './utils';

const INDEX_TS = 'index.ts';
const INDEX_JS = 'index.js';

const TS_CODE_1 = `import * as debug from '@google-cloud/debug-agent';`;
const TS_CODE_2 = `import * as debug from '@google-cloud/debug-agent';
debug.start();
`;
const TS_CODE_3 = `import * as debug from '@google-cloud/debug-agent';
debug.start({ allowExpressions: true });
`;

const TS_CODE = [TS_CODE_1, TS_CODE_2, TS_CODE_3];

const JS_CODE_1 = `require('@google-cloud/debug-agent').start()`;
const JS_CODE_2 = `require('@google-cloud/debug-agent').start({})`;
const JS_CODE_3 = `require('@google-cloud/debug-agent').start({
  allowExpressions: true
})`;

const JS_CODE = [JS_CODE_1, JS_CODE_2, JS_CODE_3];

const TIMEOUT_MS = 60*1000;

const DEBUG = false;
function log(txt: string): void {
  if (DEBUG) {
    console.log(txt);
  }
}

const stdio = DEBUG ? 'inherit' : 'ignore';

describe('installs correctly', () => {
  let installDir: string|undefined;
  beforeEach(async function() {
    this.timeout(TIMEOUT_MS);
    // This script assumes that you don't already have a TGZ file
    // in your current working directory.
    installDir = await tmpDirP();
    log(`Using installation directory: ${installDir}`);
    await spawnP('npm', ['install'], { stdio }, log);
    await spawnP('npm', ['run', 'compile'], { stdio }, log);
    await spawnP('npm', ['pack'], { stdio }, log);
    const tgz = await globP(`${process.cwd()}/*.tgz`);
    if (tgz.length !== 1) {
      throw new Error(`Expected 1 tgz file in current directory, but found ${tgz.length}`);
    }
    await spawnP('npm', ['init', '-y'], {
      cwd: installDir,
      stdio
    }, log);
    await spawnP('npm', ['install', 'typescript', '@types/node', tgz[0]], {
      cwd: installDir,
      stdio
    }, log);
  });

  afterEach(async function() {
    this.timeout(TIMEOUT_MS);
    if (installDir) {
      await rimrafP(installDir);
    }
  });

  TS_CODE.forEach((code) => {
    it(`Should install and work with the Typescript code:\n${code}`, async function() {
      this.timeout(TIMEOUT_MS);
      assert(installDir);
      await writeFileP(path.join(installDir!, INDEX_TS), code, 'utf-8');
      await spawnP(`node_modules${path.sep}.bin${path.sep}tsc`, [INDEX_TS], {
        cwd: installDir,
        stdio
      }, log);
      await spawnP('node', [INDEX_JS], {
        cwd: installDir,
        stdio
      }, log);
    });
  });

  JS_CODE.forEach((code) => {
    it(`Should install and work with the Javascript code:\n${code}`, async function() {
      this.timeout(TIMEOUT_MS);
      assert(installDir);
      await writeFileP(path.join(installDir!, INDEX_JS), code, 'utf-8');
      await spawnP('node', [INDEX_JS], {
        cwd: installDir,
        stdio
      }, log);
    });
  });
});
