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
'use strict';

var assert = require('assert');
var request = require('request');
var config = require('../../src/agent/config.js');
var Debuglet = require('../../src/agent/debuglet.js');
var semver = require('semver');

var DEBUGGEE_ID = 'bar';
var API = 'https://clouddebugger.googleapis.com';
var REGISTER_PATH = '/v2/controller/debuggees/register';
var BPS_PATH = '/v2/controller/debuggees/' + DEBUGGEE_ID + '/breakpoints';

var nock = require('nock');
var nocks = require('../nocks.js');
nock.disableNetConnect();

var debuglet;

describe(__filename, function(){
  beforeEach(function() {
    process.env.GCLOUD_PROJECT = 0;
    process.env.GOOGLE_APPLICATION_CREDENTIALS =
      './test/fixtures/gcloud-credentials.json';
    debuglet = new Debuglet(require('../..')(), config);
    debuglet.once('started', function() {
      debuglet.debugletApi_.request_ = request; // Avoid authing.
    });
  });

  afterEach(function() {
    debuglet.stop();
    delete process.env.GCLOUD_PROJECT;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  });

  it('should capture breakpoint quickly', function(done) {
    this.timeout(10000);
    var h = require('../fixtures/expensive-capture.js');
    var hitMillis;
    var reportedMillis;
    var expensiveBp = {
      id: 'test',
      location: { path: 'fixtures/expensive-capture.js', line: 7},
      condition: 'n===7',
      expressions: ['a', 'process']
    };

    var authScope = nocks.oauth2();

    var scope = nock(API)
      .post(REGISTER_PATH)
      .reply(200, {
        debuggee: {
          id: DEBUGGEE_ID
        }
      })
      .get(BPS_PATH + '?success_on_timeout=true')
      .reply(200, {
        breakpoints: [expensiveBp]
      })
      .put(BPS_PATH + '/test', function(body) {
        reportedMillis = Date.now();
        setImmediate(function() {
          // See slowdown in state.js#resolveMirror_
          var toleranceMillis = 40;
          if (semver.satisfies(process.version, '<1.6')) {
            toleranceMillis = 110;
          }
          scope.done();
          assert(reportedMillis - hitMillis < toleranceMillis,
            'Reported time (' + reportedMillis +
            ') should differ from breakpoint hit time (' + hitMillis +
            ') by less than ' + toleranceMillis + 'ms' +
            ' (diff: ' + (reportedMillis - hitMillis) + 'ms)');
          done();
        });
        return body.breakpoint.isFinalState && !body.breakpoint.status;
      })
      .reply(200);

    debuglet.once('registered', function(id) {
      authScope.done();
      assert(id === DEBUGGEE_ID);
      setTimeout(function() {
        hitMillis = Date.now();
        h.rec(7);
      }, 500);
    });

    debuglet.start();
  });
});

