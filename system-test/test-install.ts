// Copyright 2019 Google LLC
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as execa from 'execa';
import * as mv from 'mv';
import {ncp} from 'ncp';
import * as tmp from 'tmp-promise';
import {promisify} from 'util';

const mvp = (promisify(mv) as {}) as (...args: string[]) => Promise<void>;
const ncpp = promisify(ncp);
const stagingDir = tmp.dirSync({keep: false, unsafeCleanup: true});
const stagingPath = stagingDir.name;
const pkg = require('../../package.json');

async function run(path: string) {
  await execa('node', ['--throw-deprecation', `build/src/${path}`], {
    cwd: `${stagingPath}/`,
    stdio: 'inherit',
  });
}

describe.only('📦 pack and install', () => {

  // npm pack the module, and create a tmp staging directory
  before('pack and install', async () => {
    await execa('npm', ['pack', '--unsafe-perm'], { stdio: 'inherit' });
    const tarball = `google-cloud-debug-agent-${pkg.version}.tgz`;
    await mvp(tarball, `${stagingPath}/debug.tgz`);
    await ncpp('system-test/fixtures/sample', `${stagingPath}/`);
    await execa('npm', ['install', '--unsafe-perm'], {
      cwd: `${stagingPath}/`,
      stdio: 'inherit',
    });
  });

  it('should import the module', async () => {
    await run('import.js');
  });

  it('should import the module and start without arguments', async () => {
    await run('noargs.js');
  });

  it('should start with allowExpressions', async () => {
    await run('allowExpressions.js');
  });

  it('should start with a partial serviceContext', async () => {
    await run('partialServiceContext.js');
  });

  it('should start with a complete serviceContext', async () => {
    await run('completeServiceContext.js');
  });

  it('should import and start with a partial capture', async () => {
    await run('partialCapture.js');
  });

  it('should start with js without arguments', async () => {
    await run('start.js');
  });

  it('should require the module and start with {}', async () => {
    await run('startEmpty.js');
  });

  it('should start with allowExpressions', async () => {
    await run('allowExpressionsJs.js');
  });

  after('cleanup staging', () => {
    stagingDir.removeCallback();
  });
});
