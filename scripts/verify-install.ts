
import * as path from 'path';
import { globP, ncpP, spawnP, tmpDirP, writeFileP } from './utils';

const INDEX_TS = 'index.ts';
const INDEX_JS = 'index.js';

const TS_CODE_1 = `import * as debug from '@google-cloud/debug-agent';`;
const TS_CODE_2 = `import * as debug from '@google-cloud/debug-agent';
debug.start();
`;
const TS_CODE_3 = `import * as debug from '@google-cloud/debug-agent';
debug.start({ allowExpressions: true });
`;

const JS_CODE_1 = `require('@google-cloud/debug-agent').start()`;
const JS_CODE_2 = `require('@google-cloud/debug-agent').start({})`;
const JS_CODE_3 = `require('@google-cloud/debug-agent').start({
  allowExpressions: true
})`;

async function setupInstallDir(): Promise<string> {
  // This script assumes that you don't already have a TGZ file
  // in your current working directory.
  const installDir = await tmpDirP();
  console.log(installDir);
  await spawnP('npm', ['install']);
  await spawnP('npm', ['run', 'compile']);
  await spawnP('npm', ['pack']);
  const tgz = await globP(`${process.cwd()}/*.tgz`);
  if (tgz.length !== 1) {
    throw new Error(`Expected 1 tgz file in current directory, but found ${tgz.length}`);
  }
  await spawnP('npm', ['init', '-y'], {
    cwd: installDir
  });
  await spawnP('npm', ['install', 'typescript', '@types/node', tgz[0]], {
    cwd: installDir
  });
  return installDir;
}

/**
 * This function checks that the following two (sequential) operations succeed:
 * 1. In a temporary directory, installs from the `npm pack` of this directory
 * 2. Compiles a top-level file in that directory that imports this module
 */
async function verifyInstallWithTs(content: string) {
  const installDir = await setupInstallDir();
  await writeFileP(path.join(installDir, INDEX_TS), content, 'utf-8');
  await spawnP(`node_modules${path.sep}.bin${path.sep}tsc`, [INDEX_TS], {
    cwd: installDir
  });
  await spawnP('node', [INDEX_JS], {
    cwd: installDir
  });
  console.log(`'npm install' with Typescript was successful using code:\n${content}`);
}

async function verifyInstallWithJs(content: string) {
  const installDir = await setupInstallDir();
  await writeFileP(path.join(installDir, INDEX_JS), content, 'utf-8');
  await spawnP('node', [INDEX_JS], {
    cwd: installDir
  });
  console.log(`'npm install' with Javascript was successful using code:\n${content}`);
}

async function main() {
  await verifyInstallWithTs(TS_CODE_1);
  await verifyInstallWithTs(TS_CODE_2);
  await verifyInstallWithTs(TS_CODE_3);

  await verifyInstallWithJs(JS_CODE_1);
  await verifyInstallWithJs(JS_CODE_2);
  await verifyInstallWithJs(JS_CODE_3);
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
