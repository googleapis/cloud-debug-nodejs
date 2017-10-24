/**
 * Copyright 2016 Google Inc. All Rights Reserved.
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

import {DebugAgentConfig} from '../src/agent/config';
import {Debug} from '../src/client/stackdriver/debug';

import * as path from 'path';
import * as assert from 'assert';
import * as nock from 'nock';
import * as nocks from './nocks';
import * as extend from 'extend';
import * as config from '../src/agent/config';
import {Debuglet} from '../src/agent/debuglet';

const envProject = process.env.GCLOUD_PROJECT;
const appInfo = {
  name: 'Some name',
  version: 'Some version'
};

nock.disableNetConnect();

describe('test-options-credentials', function() {
  let debuglet: Debuglet|null = null;

  beforeEach(function() {
    delete process.env.GCLOUD_PROJECT;
    assert.equal(debuglet, null);
  });

  afterEach(function() {
    assert.ok(debuglet);
    // TODO: Handle the case when debuglet is null
    (debuglet as any).stop();
    debuglet = null;
    process.env.GCLOUD_PROJECT = envProject;
  });

  it('should use the keyFilename field of the options object', function(done) {
    const credentials = require('./fixtures/gcloud-credentials.json');
    const options = extend({}, {
      projectId: 'fake-project',
      keyFilename: path.join(__dirname, 'fixtures', 'gcloud-credentials.json')
    });
    const debug = new Debug(options, appInfo);
    const scope = nocks.oauth2(function(body) {
      assert.equal(body.client_id, credentials.client_id);
      assert.equal(body.client_secret, credentials.client_secret);
      assert.equal(body.refresh_token, credentials.refresh_token);
      return true;
    });
    // Since we have to get an auth token, this always gets intercepted second.
    nocks.register(function() {
      scope.done();
      setImmediate(done);
      return true;
    });
    nocks.projectId('project-via-metadata');
    // TODO: Determine how to remove this cast.
    debuglet = new Debuglet(debug, config as any as DebugAgentConfig);
    debuglet.start();
  });

  it('should use the credentials field of the options object', function(done) {
    const options = extend({}, {
      projectId: 'fake-project',
      credentials: require('./fixtures/gcloud-credentials.json')
    });
    const debug = new Debug(options, appInfo);
    const scope = nocks.oauth2(function(body) {
      assert.equal(body.client_id, options.credentials.client_id);
      assert.equal(body.client_secret, options.credentials.client_secret);
      assert.equal(body.refresh_token, options.credentials.refresh_token);
      return true;
    });
    // Since we have to get an auth token, this always gets intercepted second.
    nocks.register(function() {
      scope.done();
      setImmediate(done);
      return true;
    });
    nocks.projectId('project-via-metadata');
    // TODO: Determine how to remove this cast.
    debuglet = new Debuglet(debug, config as any as DebugAgentConfig);
    debuglet.start();
  });

  it('should ignore keyFilename if credentials is provided', function(done) {
    const fileCredentials = require('./fixtures/gcloud-credentials.json');
    const credentials = {
      client_id: 'a',
      client_secret: 'b',
      refresh_token: 'c',
      type: 'authorized_user'
    };
    const options = extend({}, {
      projectId: 'fake-project',
      keyFilename: path.join('test', 'fixtures', 'gcloud-credentials.json'),
      credentials: credentials
    });
    const debug = new Debug(options, appInfo);
    const scope = nocks.oauth2(function(body) {
      assert.equal(body.client_id, credentials.client_id);
      assert.equal(body.client_secret, credentials.client_secret);
      assert.equal(body.refresh_token, credentials.refresh_token);
      return true;
    });
    // Since we have to get an auth token, this always gets intercepted second.
    nocks.register(function() {
      scope.done();
      setImmediate(done);
      return true;
    });
    nocks.projectId('project-via-metadata');
    ['client_id', 'client_secret', 'refresh_token'].forEach(function(field) {
      assert(fileCredentials.hasOwnProperty(field));
      assert(options.credentials.hasOwnProperty(field));
      assert.notEqual(options.credentials[field], fileCredentials[field]);
    });
    // TODO: Determine how to remove this cast.
    debuglet = new Debuglet(debug, config as any as DebugAgentConfig);
    debuglet.start();
  });
});
