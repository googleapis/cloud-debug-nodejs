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

import * as check from 'post-install-check';

const TS_CODE_ARRAY: check.CodeSample[] = [
  {
    code: `import * as debug from '@google-cloud/debug-agent';`,
    description: 'imports the module',
    dependencies: [],
    devDependencies: []
  },
  {
    code: `import * as debug from '@google-cloud/debug-agent';
debug.start();`,
    description: 'imports the module and starts without arguments',
    dependencies: [],
    devDependencies: []
  },
  {
    code: `import * as debug from '@google-cloud/debug-agent';
debug.start({ allowExpressions: true });`,
    description: 'imports the module and starts with {allowExpressions: true}',
    dependencies: [],
    devDependencies: []
  },
  {
    code: `import * as debug from '@google-cloud/debug-agent';
debug.start({
  allowExpressions: true,
  serviceContext: {
    service: 'Some service'
  }
});`,
    description:
        'imports the module and starts with a partial `serviceContext`',
    dependencies: [],
    devDependencies: []
  },
  {
    code: `import * as debug from '@google-cloud/debug-agent';
debug.start({
  allowExpressions: true,
  serviceContext: {
    service: 'Some service',
    version: 'Some version'
  }
});`,
    description:
        'imports the module and starts with a complete `serviceContext`',
    dependencies: [],
    devDependencies: []
  },
  {
    code: `import * as debug from '@google-cloud/debug-agent';
debug.start({
  capture: {
    maxFrames: 1
  }
});`,
    description: 'imports the module and starts with a partial `capture`',
    dependencies: [],
    devDependencies: []
  }
];

const JS_CODE_ARRAY: check.CodeSample[] = [
  {
    code: `require('@google-cloud/debug-agent').start()`,
    description: 'requires the module and starts without arguments',
    dependencies: [],
    devDependencies: []
  },
  {
    code: `require('@google-cloud/debug-agent').start({})`,
    description: 'requires the module and starts with {}',
    dependencies: [],
    devDependencies: []
  },
  {
    code: `require('@google-cloud/debug-agent').start({
  allowExpressions: true
})`,
    description: 'requires the module and stargs with {allowExpressions: true}',
    dependencies: [],
    devDependencies: []
  }
];

check.testInstallation(TS_CODE_ARRAY, JS_CODE_ARRAY, {timeout: 2 * 60 * 1000});
