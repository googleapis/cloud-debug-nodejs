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
'use strict';

var path = require('path');
var assert = require('assert');
var nock = require('nock');
var extend = require('extend');
var logger = require('@google/cloud-diagnostics-common').logger;
var defaultConfig = require('../../src/agent/config.js');
var Debuglet = require('../../src/agent/debuglet.js');

var envProject = process.env.GCLOUD_PROJECT;

nock.disableNetConnect();

function accept() {
  return true;
}

function nockOAuth2(validator) {
  return nock('https://accounts.google.com')
      .post('/o/oauth2/token', validator)
      .reply(200, {
        refresh_token: 'hello',
        access_token: 'goodbye',
        expiry_date: new Date(9999, 1, 1)
      });
}

function nockRegister(validator) {
  return nock('https://clouddebugger.googleapis.com')
      .post('/v2/controller/debuggees/register', validator)
      .reply(200);
}

describe('test-config-credentials', function() {
  var debuglet = null;

  beforeEach(function() {
    delete process.env.GCLOUD_PROJECT;
    assert.equal(debuglet, null);
  });

  afterEach(function() {
    assert.ok(debuglet);
    debuglet.stop();
    debuglet = null;
    process.env.GCLOUD_PROJECT = envProject;
  });

  it('should use config.projectId in preference to the environment variable',
     function(done) {
       process.env.GCLOUD_PROJECT = 'should-not-be-used';

       var config = extend({}, defaultConfig, {
         projectId: 'project-via-config',
         credentials: require('../fixtures/gcloud-credentials.json')
       });
       var debug = require('../..')(config);

       // TODO: also make sure we don't request the project from metadata
       // service.

        var scope = nockOAuth2(accept);
        nockRegister(function(body) {
          assert.ok(body.debuggee);
          assert.equal(body.debuggee.project, 'project-via-config');
          scope.done();
          setImmediate(done);
          return true;
        });

       debuglet =
           new Debuglet(debug, config, logger.create(logger.WARN, 'testing'));
       debuglet.start();
     });

  it('should use the keyFilename field of the config object', function(done) {
    var credentials = require('../fixtures/gcloud-credentials.json');
    var config = extend({}, defaultConfig, {
      projectId: 'fake-project',
      keyFilename: path.join('test', 'fixtures', 'gcloud-credentials.json')
    });
    var debug = require('../..')(config);
    var scope = nockOAuth2(function(body) {
      assert.equal(body.client_id, credentials.client_id);
      assert.equal(body.client_secret, credentials.client_secret);
      assert.equal(body.refresh_token, credentials.refresh_token);
      return true;
    });
    // Since we have to get an auth token, this always gets intercepted second.
    nockRegister(function() {
      scope.done();
      setImmediate(done);
      return true;
    });
    debuglet =
        new Debuglet(debug, config, logger.create(logger.WARN, 'testing'));
    debuglet.start();
  });

  it('should use the credentials field of the config object', function(done) {
    var config = extend({}, defaultConfig, {
      projectId: 'fake-project',
      credentials: require('../fixtures/gcloud-credentials.json')
    });
    var debug = require('../..')(config);
    var scope = nockOAuth2(function(body) {
      assert.equal(body.client_id, config.credentials.client_id);
      assert.equal(body.client_secret, config.credentials.client_secret);
      assert.equal(body.refresh_token, config.credentials.refresh_token);
      return true;
    });
    // Since we have to get an auth token, this always gets intercepted second.
    nockRegister(function() {
      scope.done();
      setImmediate(done);
      return true;
    });
    debuglet = new Debuglet(debug, config, logger.create(undefined, 'testing'));
    debuglet.start();
  });

  it('should ignore keyFilename if credentials is provided', function(done) {
    var fileCredentials = require('../fixtures/gcloud-credentials.json');
    var credentials = {
      client_id: 'a',
      client_secret: 'b',
      refresh_token: 'c',
      type: 'authorized_user'
    };
    var config = extend({}, defaultConfig, {
      projectId: 'fake-project',
      keyFilename: path.join('test', 'fixtures', 'gcloud-credentials.json'),
      credentials: credentials
    });
    var debug = require('../..')(config);
    var scope = nockOAuth2(function(body) {
      assert.equal(body.client_id, credentials.client_id);
      assert.equal(body.client_secret, credentials.client_secret);
      assert.equal(body.refresh_token, credentials.refresh_token);
      return true;
    });
    // Since we have to get an auth token, this always gets intercepted second.
    nockRegister(function() {
      scope.done();
      setImmediate(done);
      return true;
    });
    ['client_id', 'client_secret', 'refresh_token'].forEach(function(field) {
      assert(fileCredentials.hasOwnProperty(field));
      assert(config.credentials.hasOwnProperty(field));
      assert.notEqual(config.credentials[field], fileCredentials[field]);
    });
    debuglet = new Debuglet(debug, config, logger.create(undefined, 'testing'));
    debuglet.start();
  });
});
