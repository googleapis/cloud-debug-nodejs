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
var defaultConfig = require('../../src/config.js').debug;
var Debuglet = require('../../src/agent/debuglet.js');

nock.disableNetConnect();
process.env.GCLOUD_PROJECT = 0;

describe('test-config-credentials', function() {
  var debuglet = null;

  beforeEach(function() {
    assert.equal(debuglet, null);
  });

  afterEach(function() {
    assert.ok(debuglet);
    debuglet.stop();
    debuglet = null;
  });


  it('should use the keyFilename field of the config object', function(done) {
    var credentials = require('../fixtures/gcloud-credentials.json');
    var config = extend({}, defaultConfig, {
      keyFilename: path.join('test', 'fixtures', 'gcloud-credentials.json')
    });
    var scope = nock('https://accounts.google.com')
      .post('/o/oauth2/token', function(body) {
        assert.equal(body.client_id, credentials.client_id);
        assert.equal(body.client_secret, credentials.client_secret);
        assert.equal(body.refresh_token, credentials.refresh_token);
        return true;
      }).reply(200, {
        refresh_token: 'hello',
        access_token: 'goodbye',
        expiry_date: new Date(9999, 1, 1)
      });
    // Since we have to get an auth token, this always gets intercepted second
    nock('https://clouddebugger.googleapis.com')
      .post('/v2/controller/debuggees/register', function() {
        scope.done();
        setImmediate(done);
        return true;
      }).reply(200);
    debuglet = new Debuglet(config, logger.create(logger.WARN, 'testing'));
    debuglet.start();
  });

  it('should use the credentials field of the config object', function(done) {
    var config = extend({}, defaultConfig, {
      credentials: require('../fixtures/gcloud-credentials.json')
    });
    var scope = nock('https://accounts.google.com')
      .post('/o/oauth2/token', function(body) {
        assert.equal(body.client_id, config.credentials.client_id);
        assert.equal(body.client_secret, config.credentials.client_secret);
        assert.equal(body.refresh_token, config.credentials.refresh_token);
        return true;
      }).reply(200, {
        refresh_token: 'hello',
        access_token: 'goodbye',
        expiry_date: new Date(9999, 1, 1)
      });
    // Since we have to get an auth token, this always gets intercepted second
    nock('https://clouddebugger.googleapis.com')
      .post('/v2/controller/debuggees/register', function() {
        scope.done();
        setImmediate(done);
        return true;
      }).reply(200);
    debuglet = new Debuglet(config, logger.create(undefined, 'testing'));
    debuglet.start();
  });

  it('should ignore credentials if keyFilename is provided', function(done) {
    var correctCredentials = require('../fixtures/gcloud-credentials.json');
    var config = extend({}, defaultConfig, {
      keyFilename: path.join('test', 'fixtures', 'gcloud-credentials.json'),
      credentials: {
        client_id: 'a',
        client_secret: 'b',
        refresh_token: 'c',
        type: 'authorized_user'
      }
    });
    ['client_id', 'client_secret', 'refresh_token'].forEach(function (field) {
      assert(correctCredentials.hasOwnProperty(field));
      assert(config.credentials.hasOwnProperty(field));
      assert.notEqual(config.credentials[field],
        correctCredentials[field]);
    });
    var scope = nock('https://accounts.google.com')
      .post('/o/oauth2/token', function(body) {
        assert.equal(body.client_id, correctCredentials.client_id);
        assert.equal(body.client_secret, correctCredentials.client_secret);
        assert.equal(body.refresh_token, correctCredentials.refresh_token);
        return true;
      }).reply(200, {
        refresh_token: 'hello',
        access_token: 'goodbye',
        expiry_date: new Date(9999, 1, 1)
      });
    // Since we have to get an auth token, this always gets intercepted second
    nock('https://clouddebugger.googleapis.com')
      .post('/v2/controller/debuggees/register', function() {
        scope.done();
        setImmediate(done);
        return true;
      }).reply(200);
    debuglet = new Debuglet(config, logger.create(undefined, 'testing'));
    debuglet.start();
  });
});
