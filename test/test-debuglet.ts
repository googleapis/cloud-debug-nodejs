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
import * as _ from 'lodash';
import * as path from 'path';
import * as semver from 'semver';

import {DebugAgentConfig} from '../src/agent/config';
import {defaultConfig as DEFAULT_CONFIG} from '../src/agent/config';
import {Debuggee} from '../src/debuggee';
import * as stackdriver from '../src/types/stackdriver';

DEFAULT_CONFIG.allowExpressions = true;
DEFAULT_CONFIG.workingDirectory = path.join(__dirname, '..', '..');
import {Debuglet, CachedPromise} from '../src/agent/debuglet';
import * as dns from 'dns';
import * as extend from 'extend';
import * as rawMetadata from 'gcp-metadata';
const metadata: {project: Function; instance: Function;} = rawMetadata;

import {Debug} from '../src/client/stackdriver/debug';
import * as utils from '../src/agent/util/utils';

const DEBUGGEE_ID = 'bar';
const API = 'https://clouddebugger.googleapis.com';
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

declare type MetadataCallback = (err: Error|null, ob?: {}, result?: string) =>
    void;

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
  describe('runningOnGCP', () => {
    // TODO: Make this more precise.
    let savedLookup: Function;
    before(() => {
      savedLookup = dns.lookup;
    });

    after(() => {
      // TODO: Fix this cast to any that is caused by the fact that `lookup`
      //       is a readonly property.
      (dns as {lookup: {}}).lookup = savedLookup;
    });

    it('should resolve true if metadata service is resolveable', (done) => {
      // TODO: Fix this cast to any that is caused by the fact that `lookup`
      //       is a readonly property.
      // TODO: Determine if the hostname parameter should be used.
      (dns as {lookup: {}}).lookup =
          (hostname: string|null,
           cb: (err: Error|null, param: {address: string, family: string}) =>
               void) => {
            setImmediate(() => {
              cb(null, {address: '700.800.900.fake', family: 'Addams'});
            });
          };

      Debuglet.runningOnGCP().then((onGCP) => {
        assert.strictEqual(onGCP, true);
        done();
      });
    });

    it('should resolve false if metadata service not resolveable', (done) => {
      // TODO: Fix this cast to any that is caused by the fact that `lookup`
      //       is a readonly property.
      // TODO: Determine if the hostname parameter should be used.
      // TODO: Determine if these types are correct
      (dns as {lookup: {}}).lookup =
          (hostname: string, cb: (err: Error) => void) => {
            setImmediate(() => {
              cb(new Error('resolution error'));
            });
          };

      Debuglet.runningOnGCP().then((onGCP) => {
        assert.strictEqual(onGCP, false);
        done();
      });
    });
  });

  describe('getProjectIdFromMetadata', () => {
    let savedProject: Function;
    before(() => {
      savedProject = metadata.project;
    });
    after(() => {
      metadata.project = savedProject;
    });

    it('should return project retrived from metadata', (done) => {
      const FAKE_PROJECT_ID = 'fake-project-id-from-metadata';
      // TODO: Determine if the options to Debug should be optional so that
      //       new Debug() can be used instead of new Debug({}).
      // TODO: This is never used.  Determine if it should be used.
      // const debug = new Debug({});
      // TODO: This is never used.  Determine if it should be used.
      // const debuglet = new Debuglet(debug, defaultConfig);

      // TODO: Determine if the path parameter should be used.
      // TODO: Determine if these types are correct
      metadata.project = (instancePath: string, cb: MetadataCallback) => {
        setImmediate(() => {
          cb(null, {}, FAKE_PROJECT_ID);
        });
      };

      Debuglet.getProjectIdFromMetadata().then((projectId) => {
        assert.strictEqual(projectId, FAKE_PROJECT_ID);
        done();
      });
    });

    it('should return null on error', (done) => {
      // TODO: This is never used.  Determine if it should be used.
      // const debug = new Debug({});
      // TODO: This is never used.  Determine if it should be used.
      // const debuglet = new Debuglet(debug, defaultConfig);

      // TODO: Determine if the path parameter should be used.
      metadata.project = (instancePath: string, cb: MetadataCallback) => {
        setImmediate(() => {
          cb(new Error());
        });
      };

      // TODO: Determine if the err parameter should be used.
      Debuglet.getProjectIdFromMetadata().catch((err) => {
        done();
      });
    });
  });

  describe('getClusterNameFromMetadata', () => {
    let savedInstance: Function;
    before(() => {
      savedInstance = metadata.instance;
    });
    after(() => {
      metadata.instance = savedInstance;
    });

    it('should return project retrived from metadata', (done) => {
      const FAKE_CLUSTER_NAME = 'fake-cluster-name-from-metadata';
      // TODO: This is never used.  Determine if it should be used.
      // const debug = new Debug({});
      // TODO: This is never used.  Determine if it should be used.
      // const debuglet = new Debuglet(debug, defaultConfig);

      // TODO: Determine if the path parameter should be used.
      metadata.instance = (instancePath: string, cb: MetadataCallback) => {
        setImmediate(() => {
          cb(null, {}, FAKE_CLUSTER_NAME);
        });
      };

      Debuglet.getClusterNameFromMetadata().then((clusterName) => {
        assert.strictEqual(clusterName, FAKE_CLUSTER_NAME);
        done();
      });
    });

    it('should return null on error', (done) => {
      // TODO: This is never used.  Determine if it should be used.
      // const debug = new Debug({});
      // TODO: This is never used.  Determine if it should be used.
      // const debuglet = new Debuglet(debug, defaultConfig);

      // TODO: Determine if the path parameter should be used.
      metadata.instance = (instancePath: string, cb: MetadataCallback) => {
        setImmediate(() => {
          cb(new Error());
        });
      };

      // TODO: Determine if the err parameter should be used.
      Debuglet.getClusterNameFromMetadata().catch((err) => {
        done();
      });
    });
  });

  describe('getProjectId', () => {
    let savedGetProjectIdFromMetadata: () => Promise<string>;

    beforeEach(() => {
      savedGetProjectIdFromMetadata = Debuglet.getProjectIdFromMetadata;
    });

    afterEach(() => {
      Debuglet.getProjectIdFromMetadata = savedGetProjectIdFromMetadata;
    });

    it('should not query metadata if local config.projectId is set', (done) => {
      Debuglet.getProjectIdFromMetadata = () => {
        const failureMessage = 'getProjectIdFromMetadata should not be called';
        assert.fail(failureMessage);
        return Promise.reject(failureMessage);
      };
      Debuglet.getProjectId({projectId: 'from-config'}).then((projectId) => {
        assert.strictEqual(projectId, 'from-config');
        done();
      });
    });

    it('should not query metadata if env. var. is set', (done) => {
      const envs = process.env;
      process.env = {};
      process.env.GCLOUD_PROJECT = 'from-env-var';

      Debuglet.getProjectIdFromMetadata = () => {
        const failureMessage = 'getProjectIdFromMetadata should not be called';
        assert.fail(failureMessage);
        return Promise.reject(failureMessage);
      };
      Debuglet.getProjectId({}).then((projectId) => {
        assert.strictEqual(projectId, 'from-env-var');
        // restore environment variables.
        process.env = envs;
        done();
      });
    });

    it('should query the project from metadata', (done) => {
      const envs = process.env;
      process.env = {};

      Debuglet.getProjectIdFromMetadata = () => {
        return Promise.resolve('from-metadata');
      };
      Debuglet.getProjectId({}).then((projectId) => {
        assert.strictEqual(projectId, 'from-metadata');
        // restore environment variables.
        process.env = envs;
        done();
      });
    });

    it('should reject on error', (done) => {
      const envs = process.env;
      process.env = {};

      Debuglet.getProjectIdFromMetadata = () => {
        return Promise.reject(new Error('rejection'));
      };
      // TODO: Determine if the err parameter should be used.
      Debuglet.getProjectId({}).catch((err) => {
        // restore environment variables.
        process.env = envs;
        done();
      });
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
      assert.deepEqual(mergedConfig, compareConfig);
    });

    it(
        'should remove inspector warning listener on debug.stop', (done) => {
          function countCustomListeners(): number {
            let count = 0;
            for (const fn of process.listeners('warning')) {
              if (fn.name === 'debugAgentWarningListener') {
                count++;
              }
            }
            return count;
          }

          const projectId = '11020304f2934-a';
          const debug =
              new Debug({projectId, credentials: fakeCredentials}, packageInfo);
          const debuglet = new Debuglet(debug, defaultConfig);
          debuglet.once('started', () => {
            assert.strictEqual(countCustomListeners(), 1);
            debuglet.stop();
          });
          debuglet.once('stopped', () => {
            assert.strictEqual(countCustomListeners(), 0);
            done();
          });
          assert.strictEqual(countCustomListeners(), 0);
          debuglet.start();
        });

    it('should elaborate on inspector warning on 32 bit but not on 64 bit',
       (done) => {
         const projectId = '11020304f2934-a';
         const debug =
             new Debug({projectId, credentials: fakeCredentials}, packageInfo);
         const debuglet = new Debuglet(debug, defaultConfig);
         let logText = '';
         debuglet.logger.info = (s: string) => {
           logText += s;
         };
         nocks.projectId('project-via-metadata');
         const scope = nock(API).post(REGISTER_PATH).reply(200, {
           debuggee: {id: DEBUGGEE_ID}
         });

         debuglet.once('registered', (id: string) => {
           assert.equal(id, DEBUGGEE_ID);
           // TODO: Handle the case where debuglet.debuggee is undefined
           assert.equal((debuglet.debuggee as Debuggee).project, projectId);
           const arch = process.arch;
           if (semver.satisfies(process.version, '>=8.5.0') &&
               semver.satisfies(process.version, '<8.9.0') &&
               (arch === 'ia32' || arch === 'x86') &&
               process.env.GCLOUD_USE_INSPECTOR) {
             assert(logText.includes(utils.messages.ASYNC_TRACES_WARNING));
           } else {
             assert(!logText.includes(utils.messages.ASYNC_TRACES_WARNING));
           }
           debuglet.stop();
           scope.done();
           done();
         });

         debuglet.start();
       });

    it('should not start when projectId is not available', (done) => {
      const savedGetProjectId = Debuglet.getProjectId;
      Debuglet.getProjectId = () => {
        return Promise.reject(new Error('no project id'));
      };

      const debug = new Debug({}, packageInfo);
      const debuglet = new Debuglet(debug, defaultConfig);

      debuglet.once('initError', (err: Error) => {
        assert.ok(err);
        // no need to stop the debuggee.
        Debuglet.getProjectId = savedGetProjectId;
        done();
      });
      debuglet.once('started', () => {
        assert.fail('The debuglet should not have started');
      });
      debuglet.start();
    });

    it('should give a useful error message when projectId is not available',
       (done) => {
         const savedGetProjectId = Debuglet.getProjectId;
         Debuglet.getProjectId = () => {
           return Promise.reject(new Error('no project id'));
         };

         const debug = new Debug({}, packageInfo);
         const debuglet = new Debuglet(debug, defaultConfig);

         let message = '';
         const savedLoggerError = debuglet.logger.error;
         debuglet.logger.error = (text: string) => {
           message += text;
         };

         debuglet.once('initError', (err) => {
           Debuglet.getProjectId = savedGetProjectId;
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
      const savedGetProjectId = Debuglet.getProjectId;
      Debuglet.getProjectId = () => {
        return Promise.reject(new Error('no project id'));
      };

      const debug = new Debug({}, packageInfo);
      const debuglet = new Debuglet(debug, defaultConfig);

      debuglet.once('started', () => {
        assert.fail('The debuglet should not have started');
      });
      debuglet.once('initError', () => {
        Debuglet.getProjectId = savedGetProjectId;
        done();
      });
      debuglet.start();
    });

    it('should use config.projectId', (done) => {
      const projectId = '11020304f2934-a';
      const debug =
          new Debug({projectId, credentials: fakeCredentials}, packageInfo);
      const debuglet = new Debuglet(debug, defaultConfig);

      nocks.projectId('project-via-metadata');
      const scope = nock(API).post(REGISTER_PATH).reply(200, {
        debuggee: {id: DEBUGGEE_ID}
      });

      debuglet.once('registered', (id: string) => {
        assert.equal(id, DEBUGGEE_ID);
        // TODO: Handle the case where debuglet.debuggee is undefined
        assert.equal((debuglet.debuggee as Debuggee).project, projectId);
        debuglet.stop();
        scope.done();
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
        const debuglet = new Debuglet(debug, defaultConfig);

        nocks.projectId('project-via-metadata');
        const scope = nock(API).post(REGISTER_PATH).reply(200, {
          debuggee: {id: DEBUGGEE_ID}
        });

        debuglet.once('registered', (id: string) => {
          assert.equal(id, DEBUGGEE_ID);
          assert.equal(debuglet.debuggee!.project, process.env.GCLOUD_PROJECT);
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
           const debuglet = new Debuglet(debug, defaultConfig);

           nocks.projectId('project-via-metadata');
           const scope = nock(API).post(REGISTER_PATH).reply(200, {
             debuggee: {id: DEBUGGEE_ID}
           });

           debuglet.once('registered', (id: string) => {
             assert.equal(id, DEBUGGEE_ID);
             assert.equal(debuglet.debuggee!.project, 'project-via-options');
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
        const debuglet = new Debuglet(debug, defaultConfig);

        nocks.projectId('project-via-metadata');
        const scope = nock(API).post(REGISTER_PATH).reply(200, {
          debuggee: {id: DEBUGGEE_ID}
        });

        debuglet.once('registered', () => {
          const logger = debuglet.logger;
          const STRING1 = 'jjjjjjjjjjjjjjjjjfjfjfjf';
          const STRING2 = 'kkkkkkkfkfkfkfkfkkffkkkk';

          let buffer = '';
          const oldLog = console.log;

          console.log = (str) => {
            buffer += str;
          };
          logger.info(STRING1);
          logger.debug(STRING2);
          console.log = oldLog;

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

      it('should respect GAE_MINOR_VERSION env. var. when available', () => {
        process.env.GAE_MINOR_VERSION = 'some minor version';
        const debug = new Debug({}, packageInfo);
        const debuglet = new Debuglet(debug, defaultConfig);
        assert.ok(debuglet.config);
        assert.ok(debuglet.config.serviceContext);
        assert.strictEqual(
            debuglet.config.serviceContext.minorVersion_, 'some minor version');
      });

      it('should conjure a fake minor version when running on flex', () => {
        process.env.GAE_SERVICE = 'fake-gae-service';
        const debug = new Debug({}, packageInfo);
        const debuglet = new Debuglet(debug, defaultConfig);
        assert.ok(debuglet.config);
        assert.ok(debuglet.config.serviceContext);
        assert.ok(_.isString(debuglet.config.serviceContext.minorVersion_));
      });

      it('should not have minorVersion unless enviroment provides it', () => {
        const debug = new Debug({}, packageInfo);
        const debuglet = new Debuglet(debug, defaultConfig);
        assert.ok(debuglet.config);
        assert.ok(debuglet.config.serviceContext);
        assert.ok(
            // TODO: IMPORTANT: It appears that this test is incorrect as it
            //       is.  That is, if minorVersion is replaced with the
            //       correctly named minorVersion_, then the test fails.
            //       Resolve this.
            _.isUndefined((debuglet.config.serviceContext as {
                            minorVersion: {}
                          }).minorVersion));
      });

      it('should not provide minorversion upon registration on non flex',
         (done) => {
           const debug = new Debug(
               {projectId: 'fake-project', credentials: fakeCredentials},
               packageInfo);
           const debuglet = new Debuglet(debug, defaultConfig);

           const scope = nock(API)
                             .post(
                                 REGISTER_PATH,
                                 (body: {debuggee: Debuggee}) => {
                                   assert.ok(_.isUndefined(
                                       body.debuggee.labels!.minorversion));
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

      it('should provide minorversion upon registration if on flex', (done) => {
        process.env.GAE_SERVICE = 'fake-service';
        const debug = new Debug(
            {projectId: 'fake-project', credentials: fakeCredentials},
            packageInfo);
        const debuglet = new Debuglet(debug, defaultConfig);

        nocks.oauth2();
        const scope =
            nock(API)
                .post(
                    REGISTER_PATH,
                    (body: {debuggee: Debuggee}) => {
                      assert.ok(_.isString(body.debuggee.labels!.minorversion));
                      return true;
                    })
                .once()
                .reply(200, {debuggee: {id: DEBUGGEE_ID}});

        // TODO: Determine if the response parameter should be used.
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
      const debuglet = new Debuglet(debug, defaultConfig);

      const scope = nock(API)
                        .post(REGISTER_PATH)
                        .reply(404)
                        .post(REGISTER_PATH)
                        .reply(509)
                        .post(REGISTER_PATH)
                        .reply(200, {debuggee: {id: DEBUGGEE_ID}});

      debuglet.once('registered', (id: string) => {
        assert.equal(id, DEBUGGEE_ID);
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

    it('should register successfully otherwise', (done) => {
      const debug = new Debug(
          {projectId: 'fake-project', credentials: fakeCredentials},
          packageInfo);
      const debuglet = new Debuglet(debug, defaultConfig);

      nocks.oauth2();
      const scope = nock(API).post(REGISTER_PATH).reply(200, {
        debuggee: {id: DEBUGGEE_ID}
      });

      debuglet.once('registered', (id: string) => {
        assert.equal(id, DEBUGGEE_ID);
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
      const debuglet = new Debuglet(debug, defaultConfig);

      nocks.oauth2();
      const scope = nock(API).post(REGISTER_PATH).reply(200, {
        debuggee: {id: DEBUGGEE_ID}
      });

      debuglet.once('registered', (id: string) => {
        assert.equal(id, DEBUGGEE_ID);
        debuglet.stop();
        clusterScope.done();
        scope.done();
        Debuglet.runningOnGCP = savedRunningOnGCP;
        done();
      });

      debuglet.start();
    });

    it('should pass source context to api if present', (done) => {
      const debug = new Debug(
          {projectId: 'fake-project', credentials: fakeCredentials},
          packageInfo);
      const old = Debuglet.prototype.getSourceContext_;
      Debuglet.prototype.getSourceContext_ = (cb) => {
        setImmediate(() => {
          // TODO: Determine if 5 should be converted to a string or if the
          //       the object literal should allow keys with values that are
          //       numbers.
          // TODO: The `cb` expects the first argument to not be null.
          //       Determine if the first argument can be null.
          cb(null!, {a: 5 as {} as string});
        });
      };
      const debuglet = new Debuglet(debug, defaultConfig);

      const scope = nock(API)
                        .post(
                            REGISTER_PATH,
                            (body: {debuggee: Debuggee}) => {
                              return body.debuggee.sourceContexts![0] &&
                                  body.debuggee.sourceContexts![0].a === 5;
                            })
                        .reply(200, {debuggee: {id: DEBUGGEE_ID}});

      debuglet.once('registered', (id: string) => {
        Debuglet.prototype.getSourceContext_ = old;
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
         const debuglet = new Debuglet(debug, defaultConfig);

         const scope = nock(API).post(REGISTER_PATH).reply(200, {
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
      const debuglet = new Debuglet(debug, defaultConfig);

      const scope =
          nock(API)
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
        assert.equal(id, DEBUGGEE_ID);
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
      const debuglet = new Debuglet(debug, defaultConfig);

      const scope = nock(API)
                        .post(REGISTER_PATH)
                        .reply(200, {debuggee: {id: DEBUGGEE_ID}})
                        .get(BPS_PATH + '?successOnTimeout=true')
                        .reply(404)
                        .post(REGISTER_PATH)
                        .reply(200, {debuggee: {id: DEBUGGEE_ID}});

      debuglet.once('registered', (id1: string) => {
        assert.equal(id1, DEBUGGEE_ID);
        debuglet.once('registered', (id2: string) => {
          assert.equal(id2, DEBUGGEE_ID);
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
      const debuglet = new Debuglet(debug, defaultConfig);

      const scope = nock(API)
                        .post(REGISTER_PATH)
                        .reply(200, {debuggee: {id: DEBUGGEE_ID}})
                        .get(BPS_PATH + '?successOnTimeout=true')
                        .reply(200, {breakpoints: [bp]});

      debuglet.once('registered', function reg(id: string) {
        assert.equal(id, DEBUGGEE_ID);
        setTimeout(() => {
          assert.deepEqual(debuglet.activeBreakpointMap.test, bp);
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
         const debuglet = new Debuglet(debug, defaultConfig);

         const scope = nock(API)
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
               assert.deepEqual(debuglet.activeBreakpointMap.test1, breakpoint);
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
         const debuglet = new Debuglet(debug, defaultConfig);

         const scope = nock(API)
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
         const debuglet = new Debuglet(debug, defaultConfig);
         debuglet.config.allowExpressions = false;

         const scope =
             nock(API)
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
           assert.equal(id, DEBUGGEE_ID);
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
         const debuglet = new Debuglet(debug, defaultConfig);
         debuglet.config.allowExpressions = false;

         const scope =
             nock(API)
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
           assert.equal(id, DEBUGGEE_ID);
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
      const debuglet = new Debuglet(debug, defaultConfig);

      const scope = nock(API)
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
        assert.equal(id, DEBUGGEE_ID);
        setTimeout(() => {
          assert.deepEqual(debuglet.activeBreakpointMap.test, bp);
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
      const config = extend(
          {}, defaultConfig,
          {breakpointExpirationSec: 1, forceNewAgent_: true});
      this.timeout(6000);

      const scope = nock(API)
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

      const debuglet = new Debuglet(debug, config);
      debuglet.once('registered', (id: string) => {
        assert.equal(id, DEBUGGEE_ID);
        setTimeout(() => {
          assert.deepEqual(debuglet.activeBreakpointMap.test, bp);
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
      const config = extend({}, defaultConfig, {
        breakpointExpirationSec: 1,
        breakpointUpdateIntervalSec: 1,
        forceNewAgent_: true
      });
      this.timeout(6000);

      const scope =
          nock(API)
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

      const debuglet = new Debuglet(debug, config);
      debuglet.once('registered', (id: string) => {
        assert.equal(id, DEBUGGEE_ID);
        setTimeout(() => {
          assert.deepEqual(debuglet.activeBreakpointMap.test, bp);
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
      assert.deepEqual(Debuglet.mapSubtract(a, b), [2]);
      assert.deepEqual(Debuglet.mapSubtract(b, a), []);
      assert.deepEqual(Debuglet.mapSubtract(a, {}), [1, 2]);
      assert.deepEqual(Debuglet.mapSubtract({}, b), []);
    });
  });

  describe('format', () => {
    it('should be correct', () => {
      // TODO: Determine if Debuglet.format() should allow a number[]
      //       or if only string[] should be allowed.
      assert.deepEqual(Debuglet.format('hi', [5] as {} as string[]), 'hi');
      assert.deepEqual(Debuglet.format('hi $0', [5] as {} as string[]), 'hi 5');
      assert.deepEqual(
          Debuglet.format('hi $0 $1', [5, 'there'] as {} as string[]),
          'hi 5 there');
      assert.deepEqual(
          Debuglet.format('hi $0 $1', [5] as {} as string[]), 'hi 5 $1');
      assert.deepEqual(
          Debuglet.format('hi $0 $1 $0', [5] as {} as string[]), 'hi 5 $1 5');
      assert.deepEqual(Debuglet.format('hi $$', [5] as {} as string[]), 'hi $');
      assert.deepEqual(
          Debuglet.format('hi $$0', [5] as {} as string[]), 'hi $0');
      assert.deepEqual(
          Debuglet.format('hi $00', [5] as {} as string[]), 'hi 50');
      assert.deepEqual(
          Debuglet.format('hi $0', ['$1', 5] as {} as string[]), 'hi $1');
      assert.deepEqual(
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
