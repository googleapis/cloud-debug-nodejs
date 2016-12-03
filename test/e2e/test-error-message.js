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

var assert = require('assert');
var request = require('request');
var logger = require('@google/cloud-diagnostics-common').logger;
var config = require('../../config.js');
var Debuglet = require('../../src/debuglet.js');
var semver = require('semver');

var nock = require('nock');
nock.disableNetConnect();

describe(__filename, function() {
  it('should re-fetch breakpoints on error', function(done) {
    assert(semver.satisfies(process.version, '5.2.x'));
    var debuglet = new Debuglet(
      config, logger.create(config.logLevel, '@google/cloud-debug'));

    process.env.GCLOUD_PROJECT=0;

    var API = 'https://clouddebugger.googleapis.com';

    var scope = nock(API)
      .post('/v2/controller/debuggees/register')
      .reply(200, {
        debuggee: {
          id: 'bar'
        }
      })
      .get('/v2/controller/debuggees/bar/breakpoints')
      .reply(200, {
        breakpoints: [{
          id: 'test',
          location: { path: 'fixtures/foo.js', line: 2 }
        }]
      })
      .put('/v2/controller/debuggees/bar/breakpoints/test', function(body) {
        var status = body.breakpoint.status;
        var partialMessage = 'Node.js version not supported.';
        return status.isError &&
          (status.description.format.indexOf(partialMessage) !== -1);
      })
      .reply(200);

    debuglet.once('started', function() {
      debuglet.debugletApi_.request_ = request; // Avoid authing.
    });
    debuglet.once('registered', function reg(id) {
      assert(id === 'bar');
      setTimeout(function() {
        debuglet.stop();
        scope.done();
        done();
      }, 200);
    });

    debuglet.start();
  });
});
