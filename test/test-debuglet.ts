/**
 * Copyright 2015 Google Inc. All Rights Reserved.
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
import * as fs from 'fs';
import * as path from 'path';
import * as proxyquire from 'proxyquire';

import {DebugAgentConfig, ResolvedDebugAgentConfig} from '../src/agent/config';
import {defaultConfig as DEFAULT_CONFIG} from '../src/agent/config';
import {Debuggee} from '../src/debuggee';
import * as stackdriver from '../src/types/stackdriver';

DEFAULT_CONFIG.allowExpressions = true;
DEFAULT_CONFIG.workingDirectory = path.join(__dirname, '..', '..');
import {Debuglet, CachedPromise, FindFilesResult} from '../src/agent/debuglet';
import {ScanResults} from '../src/agent/io/scanner';
import * as extend from 'extend';
import {Debug} from '../src/client/stackdriver/debug';

const DEBUGGEE_ID = 'bar';
const REGISTER_PATH = '/v2/controller/debuggees/register';
const BPS_PATH = '/v2/controller/debuggees/' + DEBUGGEE_ID + '/breakpoints';
const EXPRESSIONS_REGEX =
    /Expressions and conditions are not allowed.*https:\/\/goo\.gl\/ShSm6r/;

const fakeCredentials = require('./fixtures/gcloud-credentials.json');

const packageInfo = {
  name: 'Some name',
  version: 'Some version'
};

import * as nock from 'nock';
import * as nocks from './nocks';
nock.disableNetConnect();

const defaultConfig = extend(true, {}, DEFAULT_CONFIG, {logLevel: 0});

let oldGP: string|undefined;

// TODO: Have this actually implement Breakpoint.
const bp: stackdriver.Breakpoint = {
  id: 'test',
  action: 'CAPTURE',
  location: {path: 'build/test/fixtures/foo.js', line: 2}
} as stackdriver.Breakpoint;
// TODO: Have this actually implement Breakpoint.
const errorBp: stackdriver.Breakpoint = {
  id: 'testLog',
  action: 'FOO',
  location: {path: 'build/test/fixtures/foo.js', line: 2}
} as {} as stackdriver.Breakpoint;

function verifyBreakpointRejection(
    re: RegExp, body: {breakpoint: stackdriver.Breakpoint}) {
  const status = body.breakpoint.status;
  const hasCorrectDescription = status!.description.format.match(re);
  return status!.isError && hasCorrectDescription;
}


describe('CachedPromise', () => {
  it('CachedPromise.get() will resolve after CachedPromise.resolve()',
     function(done) {
       this.timeout(2000);
       const cachedPromise = new CachedPromise();
       cachedPromise.get().then(() => {
         done();
       });
       cachedPromise.resolve();
     });
});

describe('Debuglet', () => {
  describe('findFiles', () => {
    const SOURCEMAP_DIR = path.join(__dirname, 'fixtures', 'sourcemaps');

    it('throws an error for an invalid directory', async () => {
      let err: Error|null = null;
      try {
        await Debuglet.findFiles(false, path.join(SOURCEMAP_DIR, '!INVALID!'));
      } catch (e) {
        err = e;
      }
      assert.ok(err);
    });

    it('finds the correct sourcemaps files', async () => {
      const searchResults = await Debuglet.findFiles(false, SOURCEMAP_DIR);
      assert(searchResults.jsStats);
      assert.strictEqual(Object.keys(searchResults.jsStats).length, 1);
      assert(searchResults.jsStats[path.join(SOURCEMAP_DIR, 'js-file.js')]);
      assert.strictEqual(searchResults.mapFiles.length, 1);
      assert(searchResults.mapFiles[0].endsWith('js-map-file.js.map'));
    });
  });

  describe('setup', () => {
    before(() => {
      oldGP = process.env.GCLOUD_PROJECT;
    });

    after(() => {
      process.env.GCLOUD_PROJECT = oldGP;
    });

    beforeEach(() => {
      delete process.env.GCLOUD_PROJECT;
      nocks.oauth2();
    });

    afterEach(() => {
      nock.cleanAll();
    });

    it('should merge config correctly', () => {
      const testValue = 2 * defaultConfig.capture.maxExpandFrames;
      const config = {capture: {maxExpandFrames: testValue}};

      // TODO: Fix this so that config does not have to be cast as
      // DebugAgentConfig.
      const mergedConfig =
          Debuglet.normalizeConfig_(config as DebugAgentConfig);
      // TODO: Debuglet.normalizeConfig_() expects 1 parameter but the original
      //       test code had zero arguments here.  Determine which is correct.
      const compareConfig = Debuglet.normalizeConfig_(null!);
      // The actual config should be exactly defaultConfig with only
      // maxExpandFrames adjusted.
      compareConfig.capture.maxExpandFrames = testValue;
      assert.deepStrictEqual(mergedConfig, compareConfig);
    });

    it('should not start when projectId is not available', (done) => {
      const debug = new Debug({}, packageInfo);

      const savedGetProjectId = debug.authClient.getProjectId;
      debug.authClient.getProjectId = () => {
        return Promise.reject(new Error('no project id'));
      };

      const debuglet = new Debuglet(debug, defaultConfig);

      debuglet.once('initError', (err: Error) => {
        assert.ok(err);
        // no need to stop the debuggee.
        debug.authClient.getProjectId = savedGetProjectId;
        done();
      });
      debuglet.once('started', () => {
        assert.fail('The debuglet should not have started');
      });
      debuglet.start();
    });

    it('should give a useful error message when projectId is not available',
       (done) => {
         const debug = new Debug({}, packageInfo);

         const savedGetProjectId = debug.authClient.getProjectId;
         debug.authClient.getProjectId = () => {
           return Promise.reject(new Error('no project id'));
         };

         const debuglet = new Debuglet(debug, defaultConfig);

         let message = '';
         const savedLoggerError = debuglet.logger.error;
         debuglet.logger.error = (text: string) => {
           message += text;
         };

         debuglet.once('initError', (err) => {
           debug.authClient.getProjectId = savedGetProjectId;
           debuglet.logger.error = savedLoggerError;
           assert.ok(err);
           assert(
               message.startsWith('The project ID could not be determined:'));
           done();
         });
         debuglet.once('started', () => {
           assert.fail('The debuglet should fail to start without a projectId');
         });
         debuglet.start();
       });

    it('should not crash without project num', (done) => {
      const debug = new Debug({}, packageInfo);

      const savedGetProjectId = debug.authClient.getProjectId;
      debug.authClient.getProjectId = () => {
        return Promise.reject(new Error('no project id'));
      };

      const debuglet = new Debuglet(debug, defaultConfig);

      debuglet.once('started', () => {
        assert.fail('The debuglet should not have started');
      });
      debuglet.once('initError', () => {
        debug.authClient.getProjectId = savedGetProjectId;
        done();
      });
      debuglet.start();
    });

    it('should use config.projectId', (done) => {
      const projectId = '11020304f2934-a';
      const debug =
          new Debug({projectId, credentials: fakeCredentials}, packageInfo);

      nocks.projectId('project-via-metadata');

      const config = debugletConfig();
      const debuglet = new Debuglet(debug, config);
      const scope = nock(config.apiUrl).post(REGISTER_PATH).reply(200, {
        debuggee: {id: DEBUGGEE_ID}
      });

      debuglet.once('registered', (id: string) => {
        assert.strictEqual(id, DEBUGGEE_ID);
        // TODO: Handle the case where debuglet.debuggee is undefined
        assert.strictEqual((debuglet.debuggee as Debuggee).project, projectId);
        debuglet.stop();
        scope.done();
        done();
      });

      debuglet.start();
    });

    it('should not fail if files cannot be read', (done) => {
      const MOCKED_DIRECTORY = process.cwd();
      const errors: Array<{filename: string; error: string;}> = [];
      for (let i = 1; i <= 2; i++) {
        const filename = `cannot-read-${i}.js`;
        const error = `EACCES: permission denied, open '${filename}'`;
        errors.push({filename, error});
      }
      const mockedDebuglet = proxyquire('../src/agent/debuglet', {
        './io/scanner': {
          scan: (shouldHash: boolean, baseDir: string, regex: RegExp) => {
            assert.strictEqual(baseDir, MOCKED_DIRECTORY);
            const results: ScanResults = {
              errors: () => {
                const map = new Map<string, Error>();
                for (const item of errors) {
                  map.set(item.filename, new Error(item.error));
                }
                return map;
              },
              all: () => {
                return {};
              },
              selectStats: (regex: RegExp) => {
                return {};
              },
              selectFiles: (regex: RegExp, baseDir: string) => {
                return [];
              }
            };
            return results;
          }
        }
      });
      const debug = new Debug(
          {projectId: 'fake-project', credentials: fakeCredentials},
          packageInfo);
      const config =
          extend({}, defaultConfig, {workingDirectory: MOCKED_DIRECTORY});
      const debuglet = new mockedDebuglet.Debuglet(debug, config);
      let text = '';
      debuglet.logger.warn = (s: string) => {
        text += s;
      };

      debuglet.on('initError', (err: Error) => {
        assert.fail('It should not fail for files it cannot read');
      });

      debuglet.once('started', () => {
        for (const item of errors) {
          const regex = new RegExp(item.error);
          assert(
              regex.test(text),
              `Should warn that file '${item.filename}' cannot be read`);
        }
        debuglet.stop();
        done();
      });

      debuglet.start();
    });

    describe('environment variables', () => {
      let env: NodeJS.ProcessEnv;
      beforeEach(() => {
        env = extend({}, process.env);
      });
      afterEach(() => {
        process.env = extend({}, env);
      });

      it('should use GCLOUD_PROJECT in lieu of config.projectId', (done) => {
        process.env.GCLOUD_PROJECT = '11020304f2934-b';
        const debug = new Debug({credentials: fakeCredentials}, packageInfo);

        nocks.projectId('project-via-metadata');

        const config = debugletConfig();
        const debuglet = new Debuglet(debug, config);
        const scope = nock(config.apiUrl).post(REGISTER_PATH).reply(200, {
          debuggee: {id: DEBUGGEE_ID}
        });

        debuglet.once('registered', (id: string) => {
          assert.strictEqual(id, DEBUGGEE_ID);
          assert.strictEqual(
              debuglet.debuggee!.project, process.env.GCLOUD_PROJECT);
          debuglet.stop();
          scope.done();
          done();
        });

        debuglet.start();
      });

      it('should use options.projectId in preference to the environment variable',
         (done) => {
           process.env.GCLOUD_PROJECT = 'should-not-be-used';
           const debug = new Debug(
               {projectId: 'project-via-options', credentials: fakeCredentials},
               packageInfo);

           nocks.projectId('project-via-metadata');

           const config = debugletConfig();
           const debuglet = new Debuglet(debug, config);
           const scope = nock(config.apiUrl).post(REGISTER_PATH).reply(200, {
             debuggee: {id: DEBUGGEE_ID}
           });

           debuglet.once('registered', (id: string) => {
             assert.strictEqual(id, DEBUGGEE_ID);
             assert.strictEqual(
                 debuglet.debuggee!.project, 'project-via-options');
             debuglet.stop();
             scope.done();
             done();
           });

           debuglet.start();
         });

      it('should respect GCLOUD_DEBUG_LOGLEVEL', (done) => {
        process.env.GCLOUD_PROJECT = '11020304f2934';
        process.env.GCLOUD_DEBUG_LOGLEVEL = '3';
        const debug = new Debug({credentials: fakeCredentials}, packageInfo);

        nocks.projectId('project-via-metadata');

        const config = debugletConfig();
        const debuglet = new Debuglet(debug, config);
        const scope = nock(config.apiUrl).post(REGISTER_PATH).reply(200, {
          debuggee: {id: DEBUGGEE_ID}
        });

        let buffer = '';
        const oldConsoleError = console.error;
        console.error = (str: string) => {
          buffer += str;
        };

        debuglet.once('registered', () => {
          const logger = debuglet.logger;
          const STRING1 = 'jjjjjjjjjjjjjjjjjfjfjfjf';
          const STRING2 = 'kkkkkkkfkfkfkfkfkkffkkkk';

          logger.info(STRING1);
          logger.debug(STRING2);
          console.error = oldConsoleError;

          assert(buffer.indexOf(STRING1) !== -1);
          assert(buffer.indexOf(STRING2) === -1);

          debuglet.stop();
          scope.done();
          done();
        });

        debuglet.start();
      });

      it('should respect GAE_SERVICE and GAE_VERSION env. vars.', () => {
        process.env.GAE_SERVICE = 'fake-gae-service';
        process.env.GAE_VERSION = 'fake-gae-version';
        const debug = new Debug({}, packageInfo);
        const debuglet = new Debuglet(debug, defaultConfig);
        assert.ok(debuglet.config);
        assert.ok(debuglet.config.serviceContext);
        assert.strictEqual(
            debuglet.config.serviceContext.service, 'fake-gae-service');
        assert.strictEqual(
            debuglet.config.serviceContext.version, 'fake-gae-version');
      });

      it('should respect GAE_MODULE_NAME and GAE_MODULE_VERSION env. vars.',
         () => {
           process.env.GAE_MODULE_NAME = 'fake-gae-service';
           process.env.GAE_MODULE_VERSION = 'fake-gae-version';
           const debug = new Debug({}, packageInfo);
           const debuglet = new Debuglet(debug, defaultConfig);
           assert.ok(debuglet.config);
           assert.ok(debuglet.config.serviceContext);
           assert.strictEqual(
               debuglet.config.serviceContext.service, 'fake-gae-service');
           assert.strictEqual(
               debuglet.config.serviceContext.version, 'fake-gae-version');
         });

      it('should respect FUNCTION_NAME env. var.', () => {
        process.env.FUNCTION_NAME = 'fake-fn-name';
        const debug = new Debug({}, packageInfo);
        const debuglet = new Debuglet(debug, defaultConfig);
        assert.ok(debuglet.config);
        assert.ok(debuglet.config.serviceContext);
        assert.strictEqual(
            debuglet.config.serviceContext.service, 'fake-fn-name');
        assert.strictEqual(
            debuglet.config.serviceContext.version, 'unversioned');
      });

      it('should prefer new flex vars over GAE_MODULE_*', () => {
        process.env.GAE_MODULE_NAME = 'fake-gae-module';
        process.env.GAE_MODULE_VERSION = 'fake-gae-module-version';
        process.env.GAE_SERVICE = 'fake-gae-service';
        process.env.GAE_VERSION = 'fake-gae-version';
        const debug = new Debug({}, packageInfo);
        const debuglet = new Debuglet(debug, defaultConfig);
        assert.ok(debuglet.config);
        assert.ok(debuglet.config.serviceContext);
        assert.strictEqual(
            debuglet.config.serviceContext.service, 'fake-gae-service');
        assert.strictEqual(
            debuglet.config.serviceContext.version, 'fake-gae-version');
      });

      it('should respect GAE_DEPLOYMENT_ID env. var. when available', () => {
        process.env.GAE_DEPLOYMENT_ID = 'some deployment id';
        delete process.env.GAE_MINOR_VERSION;
        const debug = new Debug({}, packageInfo);
        const debuglet = new Debuglet(debug, defaultConfig);
        assert.ok(debuglet.config);
        assert.ok(debuglet.config.serviceContext);
        assert.strictEqual(
            debuglet.config.serviceContext.minorVersion_, 'some deployment id');
      });

      it('should respect GAE_MINOR_VERSION env. var. when available', () => {
        delete process.env.GAE_DEPLOYMENT_ID;
        process.env.GAE_MINOR_VERSION = 'some minor version';
        const debug = new Debug({}, packageInfo);
        const debuglet = new Debuglet(debug, defaultConfig);
        assert.ok(debuglet.config);
        assert.ok(debuglet.config.serviceContext);
        assert.strictEqual(
            debuglet.config.serviceContext.minorVersion_, 'some minor version');
      });

      it('should prefer GAE_DEPLOYMENT_ID over GAE_MINOR_VERSION', () => {
        process.env.GAE_DEPLOYMENT_ID = 'some deployment id';
        process.env.GAE_MINOR_VERSION = 'some minor version';
        const debug = new Debug({}, packageInfo);
        const debuglet = new Debuglet(debug, defaultConfig);
        assert.ok(debuglet.config);
        assert.ok(debuglet.config.serviceContext);
        assert.strictEqual(
            debuglet.config.serviceContext.minorVersion_, 'some deployment id');
      });

      it('should not have minorVersion unless enviroment provides it', () => {
        const debug = new Debug({}, packageInfo);
        const debuglet = new Debuglet(debug, defaultConfig);
        assert.ok(debuglet.config);
        assert.ok(debuglet.config.serviceContext);
        // TODO: IMPORTANT: It appears that this test is incorrect as it
        //       is.  That is, if minorVersion is replaced with the
        //       correctly named minorVersion_, then the test fails.
        //       Resolve this.
        assert.strictEqual(undefined, (debuglet.config.serviceContext as {
                                        minorVersion: {}
                                      }).minorVersion);
      });

      it('should not provide minorversion upon registration on non flex',
         (done) => {
           const debug = new Debug(
               {projectId: 'fake-project', credentials: fakeCredentials},
               packageInfo);

           const config = debugletConfig();
           const debuglet = new Debuglet(debug, config);
           const scope =
               nock(config.apiUrl)
                   .post(
                       REGISTER_PATH,
                       (body: {debuggee: Debuggee}) => {
                         assert.strictEqual(
                             undefined, body.debuggee.labels!.minorversion);
                         return true;
                       })
                   .once()
                   .reply(200, {debuggee: {id: DEBUGGEE_ID}});

           // TODO: Determine if the id parameter should be used.
           debuglet.once('registered', (id: string) => {
             debuglet.stop();
             scope.done();
             done();
           });
           debuglet.start();
         });
    });

    it('should retry on failed registration', function(done) {
      this.timeout(10000);
      const debug = new Debug(
          {projectId: '11020304f2934', credentials: fakeCredentials},
          packageInfo);

      const config = debugletConfig();
      const debuglet = new Debuglet(debug, config);
      const scope = nock(config.apiUrl)
                        .post(REGISTER_PATH)
                        .reply(404)
                        .post(REGISTER_PATH)
                        .reply(509)
                        .post(REGISTER_PATH)
                        .reply(200, {debuggee: {id: DEBUGGEE_ID}});

      debuglet.once('registered', (id: string) => {
        assert.strictEqual(id, DEBUGGEE_ID);
        debuglet.stop();
        scope.done();
        done();
      });

      debuglet.start();
    });

    it('should error if a package.json doesn\'t exist', (done) => {
      const debug = new Debug(
          {projectId: 'fake-project', credentials: fakeCredentials},
          packageInfo);
      const config = extend(
          {}, defaultConfig,
          {workingDirectory: __dirname, forceNewAgent_: true});
      const debuglet = new Debuglet(debug, config);

      debuglet.once('initError', (err: Error) => {
        assert(err);
        done();
      });

      debuglet.start();
    });

    it('should by default error when workingDirectory is a root directory with a package.json',
       (done) => {
         const debug = new Debug({}, packageInfo);
         /*
          * `path.sep` represents a root directory on both Windows and Unix.
          * On Windows, `path.sep` resolves to the current drive.
          *
          * That is, after opening a command prompt in Windows, relative to the
          * drive C: and starting the Node REPL, the value of `path.sep`
          * represents `C:\\'.
          *
          * If `D:` is entered at the prompt to switch to the D: drive before
          * starting the Node REPL, `path.sep` represents `D:\\`.
          */
         const root = path.sep;
         const mockedDebuglet = proxyquire('../src/agent/debuglet', {
           /*
            * Mock the 'fs' module to verify that if the root directory is used,
            * and the root directory is reported to contain a `package.json`
            * file, then the agent still produces an `initError` when the
            * working directory is the root directory.
            */
           fs: {
             stat:
                 (filepath: string|Buffer,
                  cb: (err: Error|null, stats: {}) => void) => {
                   if (filepath === path.join(root, 'package.json')) {
                     // The key point is that looking for `package.json` in the
                     // root directory does not cause an error.
                     return cb(null, {});
                   }
                   fs.stat(filepath, cb);
                 }
           }
         });
         const config = extend({}, defaultConfig, {workingDirectory: root});
         const debuglet = new mockedDebuglet.Debuglet(debug, config);
         let text = '';
         debuglet.logger.error = (str: string) => {
           text += str;
         };

         debuglet.on('initError', (err: Error) => {
           const errorMessage = 'The working directory is a root ' +
               'directory. Disabling to avoid a scan of the entire filesystem ' +
               'for JavaScript files. Use config \allowRootAsWorkingDirectory` ' +
               'if you really want to do this.';
           assert.ok(err);
           assert.strictEqual(err.message, errorMessage);
           assert.ok(text.includes(errorMessage));
           done();
         });

         debuglet.once('started', () => {
           assert.fail(
               'Should not start if workingDirectory is a root directory');
         });

         debuglet.start();
       });

    it('should be able to force the workingDirectory to be a root directory',
       (done) => {
         const root = path.sep;
         // Act like the root directory contains a `package.json` file
         const mockedDebuglet = proxyquire('../src/agent/debuglet', {
           fs: {
             stat:
                 (filepath: string|Buffer,
                  cb: (err: Error|null, stats: {}) => void) => {
                   if (filepath === path.join(root, 'package.json')) {
                     return cb(null, {});
                   }
                   fs.stat(filepath, cb);
                 }
           }
         });

         // Don't actually scan the entire filesystem.  Act like the filesystem
         // is empty.
         mockedDebuglet.Debuglet.findFiles =
             (shouldHash: boolean, baseDir: string):
                 Promise<FindFilesResult> => {
                   assert.strictEqual(baseDir, root);
                   return Promise.resolve({
                     jsStats: {},
                     mapFiles: [],
                     errors: new Map<string, Error>()
                   });
                 };

         // No need to restore `findFiles` because we are modifying a
         // mocked version of `Debuglet` not `Debuglet` itself.

         const config = extend(
             {}, defaultConfig,
             {workingDirectory: root, allowRootAsWorkingDirectory: true});

         const debug = new Debug({}, packageInfo);

         // Act like the debuglet can get a project id
         debug.authClient.getProjectId = async () => 'some-project-id';

         const debuglet = new mockedDebuglet.Debuglet(debug, config);

         debuglet.on('initError', (err: Error) => {
           assert.ifError(err);
           done();
         });

         debuglet.once('started', () => {
           debuglet.stop();
           done();
         });

         debuglet.start();
       });

    it('should register successfully otherwise', (done) => {
      const debug = new Debug(
          {projectId: 'fake-project', credentials: fakeCredentials},
          packageInfo);

      nocks.oauth2();

      const config = debugletConfig();
      const debuglet = new Debuglet(debug, config);
      const scope = nock(config.apiUrl).post(REGISTER_PATH).reply(200, {
        debuggee: {id: DEBUGGEE_ID}
      });

      debuglet.once('registered', (id: string) => {
        assert.strictEqual(id, DEBUGGEE_ID);
        debuglet.stop();
        scope.done();
        done();
      });

      debuglet.start();
    });

    it('should attempt to retrieve cluster name if needed', (done) => {
      const savedRunningOnGCP = Debuglet.runningOnGCP;
      Debuglet.runningOnGCP = () => {
        return Promise.resolve(true);
      };
      const clusterScope =
          nock('http://metadata.google.internal')
              .get('/computeMetadata/v1/instance/attributes/cluster-name')
              .once()
              .reply(200, 'cluster-name-from-metadata');

      const debug = new Debug(
          {projectId: 'fake-project', credentials: fakeCredentials},
          packageInfo);

      nocks.oauth2();

      const config = debugletConfig();
      const debuglet = new Debuglet(debug, config);
      const scope = nock(config.apiUrl).post(REGISTER_PATH).reply(200, {
        debuggee: {id: DEBUGGEE_ID}
      });

      debuglet.once('registered', (id: string) => {
        assert.strictEqual(id, DEBUGGEE_ID);
        debuglet.stop();
        clusterScope.done();
        scope.done();
        Debuglet.runningOnGCP = savedRunningOnGCP;
        done();
      });

      debuglet.start();
    });

    it('should pass config source context to api', done => {
      const REPO_URL =
          'https://github.com/non-existent-users/non-existend-repo';
      const REVISION_ID = '5';

      const debug = new Debug(
          {projectId: 'fake-project', credentials: fakeCredentials},
          packageInfo);

      const config = debugletConfig(
          {sourceContext: {url: REPO_URL, revisionId: REVISION_ID}});
      const debuglet = new Debuglet(debug, config);
      const scope = nock(config.apiUrl)
                        .post(
                            REGISTER_PATH,
                            (body: {debuggee: Debuggee}) => {
                              const context = body.debuggee.sourceContexts![0];
                              return context && context.url === REPO_URL &&
                                  context.revisionId === REVISION_ID;
                            })
                        .reply(200, {debuggee: {id: DEBUGGEE_ID}});

      debuglet.once('registered', (id: string) => {
        assert.equal(id, DEBUGGEE_ID);
        debuglet.stop();
        scope.done();
        done();
      });

      debuglet.start();
    });

    it('should pass source context to api if present', (done) => {
      const debug = new Debug(
          {projectId: 'fake-project', credentials: fakeCredentials},
          packageInfo);
      const old = Debuglet.getSourceContextFromFile;
      Debuglet.getSourceContextFromFile = async () => {
        return {a: 5 as {} as string};
      };

      const config = debugletConfig();
      const debuglet = new Debuglet(debug, config);
      const scope = nock(config.apiUrl)
                        .post(
                            REGISTER_PATH,
                            (body: {debuggee: Debuggee}) => {
                              const context = body.debuggee.sourceContexts![0];
                              return context && context.a === 5;
                            })
                        .reply(200, {debuggee: {id: DEBUGGEE_ID}});

      debuglet.once('registered', (id: string) => {
        Debuglet.getSourceContextFromFile = old;
        assert.strictEqual(id, DEBUGGEE_ID);
        debuglet.stop();
        scope.done();
        done();
      });

      debuglet.start();
    });

    it('should prefer config source context to file', done => {
      const REPO_URL =
          'https://github.com/non-existent-users/non-existend-repo';
      const REVISION_ID = '5';

      const debug = new Debug(
          {projectId: 'fake-project', credentials: fakeCredentials},
          packageInfo);

      const old = Debuglet.getSourceContextFromFile;
      Debuglet.getSourceContextFromFile = async () => {
        return {a: 5 as {} as string};
      };

      const config = debugletConfig(
          {sourceContext: {url: REPO_URL, revisionId: REVISION_ID}});
      const debuglet = new Debuglet(debug, config);
      const scope = nock(config.apiUrl)
                        .post(
                            REGISTER_PATH,
                            (body: {debuggee: Debuggee}) => {
                              const context = body.debuggee.sourceContexts![0];
                              return context && context.url === REPO_URL &&
                                  context.revisionId === REVISION_ID;
                            })
                        .reply(200, {debuggee: {id: DEBUGGEE_ID}});

      debuglet.once('registered', (id: string) => {
        Debuglet.getSourceContextFromFile = old;
        assert.equal(id, DEBUGGEE_ID);
        debuglet.stop();
        scope.done();
        done();
      });

      debuglet.start();
    });

    it('should de-activate when the server responds with isDisabled',
       function(done) {
         this.timeout(4000);
         const debug = new Debug(
             {projectId: 'fake-project', credentials: fakeCredentials},
             packageInfo);

         const config = debugletConfig();
         const debuglet = new Debuglet(debug, config);
         const scope = nock(config.apiUrl).post(REGISTER_PATH).reply(200, {
           debuggee: {id: DEBUGGEE_ID, isDisabled: true}
         });

         debuglet.once('remotelyDisabled', () => {
           assert.ok(!debuglet.fetcherActive);
           debuglet.stop();
           scope.done();
           done();
         });

         debuglet.start();
       });

    it('should retry after a isDisabled request', function(done) {
      this.timeout(4000);
      const debug = new Debug(
          {projectId: 'fake-project', credentials: fakeCredentials},
          packageInfo);

      const config = debugletConfig();
      const debuglet = new Debuglet(debug, config);
      const scope =
          nock(config.apiUrl)
              .post(REGISTER_PATH)
              .reply(200, {debuggee: {id: DEBUGGEE_ID, isDisabled: true}})
              .post(REGISTER_PATH)
              .reply(200, {debuggee: {id: DEBUGGEE_ID}});

      let gotDisabled = false;
      debuglet.once('remotelyDisabled', () => {
        assert.ok(!debuglet.fetcherActive);
        gotDisabled = true;
      });

      debuglet.once('registered', (id: string) => {
        assert.ok(gotDisabled);
        assert.strictEqual(id, DEBUGGEE_ID);
        debuglet.stop();
        scope.done();
        done();
      });

      debuglet.start();
    });

    it('should re-register when registration expires', (done) => {
      const debug = new Debug(
          {projectId: 'fake-project', credentials: fakeCredentials},
          packageInfo);
      const config = debugletConfig();
      const debuglet = new Debuglet(debug, config);
      const scope = nock(config.apiUrl)
                        .post(REGISTER_PATH)
                        .reply(200, {debuggee: {id: DEBUGGEE_ID}})
                        .get(BPS_PATH + '?successOnTimeout=true')
                        .reply(404)
                        .post(REGISTER_PATH)
                        .reply(200, {debuggee: {id: DEBUGGEE_ID}});

      debuglet.once('registered', (id1: string) => {
        assert.strictEqual(id1, DEBUGGEE_ID);
        debuglet.once('registered', (id2: string) => {
          assert.strictEqual(id2, DEBUGGEE_ID);
          debuglet.stop();
          scope.done();
          done();
        });
      });

      debuglet.start();
    });

    it('should fetch and add breakpoints', function(done) {
      this.timeout(2000);
      const debug = new Debug(
          {projectId: 'fake-project', credentials: fakeCredentials},
          packageInfo);
      const config = debugletConfig();
      const debuglet = new Debuglet(debug, config);
      const scope = nock(config.apiUrl)
                        .post(REGISTER_PATH)
                        .reply(200, {debuggee: {id: DEBUGGEE_ID}})
                        .get(BPS_PATH + '?successOnTimeout=true')
                        .reply(200, {breakpoints: [bp]});

      debuglet.once('registered', function reg(id: string) {
        assert.strictEqual(id, DEBUGGEE_ID);
        setTimeout(() => {
          assert.deepStrictEqual(debuglet.activeBreakpointMap.test, bp);
          debuglet.stop();
          scope.done();
          done();
        }, 1000);
      });

      debuglet.start();
    });

    it('should have breakpoints fetched when promise is resolved',
       function(done) {
         this.timeout(2000);
         const breakpoint: stackdriver.Breakpoint = {
           id: 'test1',
           action: 'CAPTURE',
           location: {path: 'build/test/fixtures/foo.js', line: 2}
         } as stackdriver.Breakpoint;

         const debug = new Debug(
             {projectId: 'fake-project', credentials: fakeCredentials},
             packageInfo);

         const config = debugletConfig();
         const debuglet = new Debuglet(debug, config);
         const scope = nock(config.apiUrl)
                           .post(REGISTER_PATH)
                           .reply(200, {debuggee: {id: DEBUGGEE_ID}})
                           .get(BPS_PATH + '?successOnTimeout=true')
                           .twice()
                           .reply(200, {breakpoints: [breakpoint]});
         const debugPromise = debuglet.isReadyManager.isReady();
         debuglet.once('registered', function reg(id: string) {
           debugPromise.then(() => {
             // Once debugPromise is resolved, debuggee must be registered.
             assert(debuglet.debuggee);
             setTimeout(() => {
               assert.deepStrictEqual(
                   debuglet.activeBreakpointMap.test1, breakpoint);
               debuglet.activeBreakpointMap = {};
               debuglet.stop();
               scope.done();
               done();
             }, 1000);
           });
         });
         debuglet.start();
       });

    it('should resolve breakpointFetched promise when registration expires',
       function(done) {
         this.timeout(2000);
         const debug = new Debug(
             {projectId: 'fake-project', credentials: fakeCredentials},
             packageInfo);

         // const debuglet = new Debuglet(debug, defaultConfig);
         // const scope = nock(API)
         /// this change to a unique scope per test causes
         const config = debugletConfig();
         const debuglet = new Debuglet(debug, config);
         const scope = nock(config.apiUrl)
                           .post(REGISTER_PATH)
                           .reply(200, {debuggee: {id: DEBUGGEE_ID}})
                           .get(BPS_PATH + '?successOnTimeout=true')
                           .reply(404);  // signal re-registration.
         const debugPromise = debuglet.isReadyManager.isReady();
         debugPromise.then(() => {
           debuglet.stop();
           scope.done();
           done();
         });

         debuglet.start();
       });

    it('should reject breakpoints with conditions when allowExpressions=false',
       function(done) {
         this.timeout(2000);
         const debug = new Debug(
             {projectId: 'fake-project', credentials: fakeCredentials},
             packageInfo);

         const config = debugletConfig({allowExpressions: false});
         const debuglet = new Debuglet(debug, config);
         const scope =
             nock(config.apiUrl)
                 .post(REGISTER_PATH)
                 .reply(200, {debuggee: {id: DEBUGGEE_ID}})
                 .get(BPS_PATH + '?successOnTimeout=true')
                 .reply(200, {
                   breakpoints: [{
                     id: 'test',
                     action: 'CAPTURE',
                     condition: 'x === 5',
                     location: {path: 'fixtures/foo.js', line: 2}
                   }]
                 })
                 .put(
                     BPS_PATH + '/test',
                     verifyBreakpointRejection.bind(null, EXPRESSIONS_REGEX))
                 .reply(200);

         debuglet.once('registered', function reg(id: string) {
           assert.strictEqual(id, DEBUGGEE_ID);
           setTimeout(() => {
             assert.ok(!debuglet.activeBreakpointMap.test);
             debuglet.stop();
             debuglet.config.allowExpressions = true;
             scope.done();
             done();
           }, 1000);
         });

         debuglet.start();
       });

    it('should reject breakpoints with expressions when allowExpressions=false',
       function(done) {
         this.timeout(2000);
         const debug = new Debug(
             {projectId: 'fake-project', credentials: fakeCredentials},
             packageInfo);

         const config = debugletConfig({allowExpressions: false});
         const debuglet = new Debuglet(debug, config);
         const scope =
             nock(config.apiUrl)
                 .post(REGISTER_PATH)
                 .reply(200, {debuggee: {id: DEBUGGEE_ID}})
                 .get(BPS_PATH + '?successOnTimeout=true')
                 .reply(200, {
                   breakpoints: [{
                     id: 'test',
                     action: 'CAPTURE',
                     expressions: ['x'],
                     location: {path: 'fixtures/foo.js', line: 2}
                   }]
                 })
                 .put(
                     BPS_PATH + '/test',
                     verifyBreakpointRejection.bind(null, EXPRESSIONS_REGEX))
                 .reply(200);

         debuglet.once('registered', function reg(id: string) {
           assert.strictEqual(id, DEBUGGEE_ID);
           setTimeout(() => {
             assert.ok(!debuglet.activeBreakpointMap.test);
             debuglet.stop();
             debuglet.config.allowExpressions = true;
             scope.done();
             done();
           }, 1000);
         });

         debuglet.start();
       });

    it('should re-fetch breakpoints on error', function(done) {
      this.timeout(6000);

      const debug = new Debug(
          {projectId: 'fake-project', credentials: fakeCredentials},
          packageInfo);

      const config = debugletConfig();
      const debuglet = new Debuglet(debug, config);
      const scope = nock(config.apiUrl)
                        .post(REGISTER_PATH)
                        .reply(200, {debuggee: {id: DEBUGGEE_ID}})
                        .post(REGISTER_PATH)
                        .reply(200, {debuggee: {id: DEBUGGEE_ID}})
                        .get(BPS_PATH + '?successOnTimeout=true')
                        .reply(404)
                        .get(BPS_PATH + '?successOnTimeout=true')
                        .reply(200, {waitExpired: true})
                        .get(BPS_PATH + '?successOnTimeout=true')
                        .reply(200, {breakpoints: [bp, errorBp]})
                        .put(
                            BPS_PATH + '/' + errorBp.id,
                            (body: {breakpoint: stackdriver.Breakpoint}) => {
                              const status = body.breakpoint.status;
                              return status!.isError &&
                                  status!.description.format.indexOf(
                                      'actions are CAPTURE') !== -1;
                            })
                        .reply(200);

      debuglet.once('registered', function reg(id: string) {
        assert.strictEqual(id, DEBUGGEE_ID);
        setTimeout(() => {
          assert.deepStrictEqual(debuglet.activeBreakpointMap.test, bp);
          assert(!debuglet.activeBreakpointMap.testLog);
          debuglet.stop();
          scope.done();
          done();
        }, 1000);
      });

      debuglet.start();
    });

    it('should expire stale breakpoints', function(done) {
      const debug = new Debug(
          {projectId: 'fake-project', credentials: fakeCredentials},
          packageInfo);

      this.timeout(6000);

      const config =
          debugletConfig({breakpointExpirationSec: 1, forceNewAgent_: true});
      const debuglet = new Debuglet(debug, config);
      const scope = nock(config.apiUrl)
                        .post(REGISTER_PATH)
                        .reply(200, {debuggee: {id: DEBUGGEE_ID}})
                        .get(BPS_PATH + '?successOnTimeout=true')
                        .reply(200, {breakpoints: [bp]})
                        .put(
                            BPS_PATH + '/test',
                            (body: {breakpoint: stackdriver.Breakpoint}) => {
                              const status = body.breakpoint.status;
                              return status!.description.format ===
                                  'The snapshot has expired' &&
                                  status!.refersTo === 'BREAKPOINT_AGE';
                            })
                        .reply(200);

      debuglet.once('registered', (id: string) => {
        assert.strictEqual(id, DEBUGGEE_ID);
        setTimeout(() => {
          assert.deepStrictEqual(debuglet.activeBreakpointMap.test, bp);
          setTimeout(() => {
            assert(!debuglet.activeBreakpointMap.test);
            debuglet.stop();
            scope.done();
            done();
          }, 1100);
        }, 500);
      });

      debuglet.start();
    });

    // This test catches regressions in a bug where the agent would
    // re-schedule an already expired breakpoint to expire if the
    // server listed the breakpoint as active (which it may do depending
    // on how quickly the expiry is processed).
    // The test expires a breakpoint and then has the api respond with
    // the breakpoint listed as active. It validates that the breakpoint
    // is only expired with the server once.
    it('should not update expired breakpoints', function(done) {
      const debug = new Debug(
          {projectId: 'fake-project', credentials: fakeCredentials},
          packageInfo);

      this.timeout(6000);

      const config = debugletConfig({
        breakpointExpirationSec: 1,
        breakpointUpdateIntervalSec: 1,
        forceNewAgent_: true
      });
      const debuglet = new Debuglet(debug, config);
      const scope =
          nock(config.apiUrl)
              .post(REGISTER_PATH)
              .reply(200, {debuggee: {id: DEBUGGEE_ID}})
              .get(BPS_PATH + '?successOnTimeout=true')
              .reply(200, {breakpoints: [bp]})
              .put(
                  BPS_PATH + '/test',
                  (body: {breakpoint: stackdriver.Breakpoint}) => {
                    return body.breakpoint.status!.description.format ===
                        'The snapshot has expired';
                  })
              .reply(200)
              .get(BPS_PATH + '?successOnTimeout=true')
              .times(4)
              .reply(200, {breakpoints: [bp]});

      debuglet.once('registered', (id: string) => {
        assert.strictEqual(id, DEBUGGEE_ID);
        setTimeout(() => {
          assert.deepStrictEqual(debuglet.activeBreakpointMap.test, bp);
          setTimeout(() => {
            assert(!debuglet.activeBreakpointMap.test);
            // Fetcher disables if we re-update since endpoint isn't mocked
            // twice
            assert(debuglet.fetcherActive);
            debuglet.stop();
            scope.done();
            done();
          }, 4500);
        }, 500);
      });

      debuglet.start();
    });
  });

  describe('map subtract', () => {
    it('should be correct', () => {
      const a = {a: 1, b: 2};
      const b = {a: 1};
      assert.deepStrictEqual(Debuglet.mapSubtract(a, b), [2]);
      assert.deepStrictEqual(Debuglet.mapSubtract(b, a), []);
      assert.deepStrictEqual(Debuglet.mapSubtract(a, {}), [1, 2]);
      assert.deepStrictEqual(Debuglet.mapSubtract({}, b), []);
    });
  });

  describe('format', () => {
    it('should be correct', () => {
      // TODO: Determine if Debuglet.format() should allow a number[]
      //       or if only string[] should be allowed.
      assert.deepStrictEqual(
          Debuglet.format('hi', [5] as {} as string[]), 'hi');
      assert.deepStrictEqual(
          Debuglet.format('hi $0', [5] as {} as string[]), 'hi 5');
      assert.deepStrictEqual(
          Debuglet.format('hi $0 $1', [5, 'there'] as {} as string[]),
          'hi 5 there');
      assert.deepStrictEqual(
          Debuglet.format('hi $0 $1', [5] as {} as string[]), 'hi 5 $1');
      assert.deepStrictEqual(
          Debuglet.format('hi $0 $1 $0', [5] as {} as string[]), 'hi 5 $1 5');
      assert.deepStrictEqual(
          Debuglet.format('hi $$', [5] as {} as string[]), 'hi $');
      assert.deepStrictEqual(
          Debuglet.format('hi $$0', [5] as {} as string[]), 'hi $0');
      assert.deepStrictEqual(
          Debuglet.format('hi $00', [5] as {} as string[]), 'hi 50');
      assert.deepStrictEqual(
          Debuglet.format('hi $0', ['$1', 5] as {} as string[]), 'hi $1');
      assert.deepStrictEqual(
          Debuglet.format(
              'hi $11',
              [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 'a', 'b', 'c', 'd'] as {} as
                  string[]),
          'hi b');
    });
  });

  describe('createDebuggee', () => {
    it('should have sensible labels', () => {
      const debuggee = Debuglet.createDebuggee(
          'some project', 'id',
          {service: 'some-service', version: 'production'}, {}, false,
          packageInfo);
      assert.ok(debuggee);
      assert.ok(debuggee.labels);
      assert.strictEqual(debuggee.labels!.module, 'some-service');
      assert.strictEqual(debuggee.labels!.version, 'production');
    });

    it('should not add a module label when service is default', () => {
      const debuggee = Debuglet.createDebuggee(
          'fancy-project', 'very-unique',
          {service: 'default', version: 'yellow.5'}, {}, false, packageInfo);
      assert.ok(debuggee);
      assert.ok(debuggee.labels);
      assert.strictEqual(debuggee.labels!.module, undefined);
      assert.strictEqual(debuggee.labels!.version, 'yellow.5');
    });

    it('should have an error statusMessage with the appropriate arg', () => {
      const debuggee = Debuglet.createDebuggee(
          'a', 'b', {}, {}, false, packageInfo, undefined,
          'Some Error Message');
      assert.ok(debuggee);
      assert.ok(debuggee.statusMessage);
    });
  });

  describe('_createUniquifier', () => {
    it('should create a unique string', () => {
      const fn = Debuglet._createUniquifier;

      const desc = 'description';
      const version = 'version';
      const uid = 'uid';
      const sourceContext = {git: 'something'};
      const labels = {key: 'value'};

      const u1 = fn(desc, version, uid, sourceContext, labels);

      assert.strictEqual(fn(desc, version, uid, sourceContext, labels), u1);

      assert.notStrictEqual(
          fn('foo', version, uid, sourceContext, labels), u1,
          'changing the description should change the result');
      assert.notStrictEqual(
          fn(desc, '1.2', uid, sourceContext, labels), u1,
          'changing the version should change the result');
      assert.notStrictEqual(
          fn(desc, version, '5', sourceContext, labels), u1,
          'changing the description should change the result');
      assert.notStrictEqual(
          fn(desc, version, uid, {git: 'blah'}, labels), u1,
          'changing the sourceContext should change the result');
      assert.notStrictEqual(
          fn(desc, version, uid, sourceContext, {key1: 'value2'}), u1,
          'changing the labels should change the result');
    });
  });
});

// a counter for unique test urls.
let apiUrlInc = 0;

/**
 * returns a new config object to be passed to debuglet. always has apiUrl
 * @param conf custom config values
 */
function debugletConfig(conf?: {}): (ResolvedDebugAgentConfig&
                                     {apiUrl: string}) {
  const apiUrl = 'https://clouddebugger.googleapis.com' + (++apiUrlInc);
  const c = Object.assign({}, DEFAULT_CONFIG, conf) as (
                ResolvedDebugAgentConfig & {apiUrl: string});
  c.apiUrl = apiUrl;
  return c;
}
