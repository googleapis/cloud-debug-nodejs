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
var logger = require('@google/cloud-diagnostics-common').logger;
var config = require('../../config.js');
var Debuglet = require('../../lib/debuglet.js');

var DEBUGGEE_ID = 'bar';
var API = 'https://clouddebugger.googleapis.com';
var REGISTER_PATH = '/v2/controller/debuggees/register';
var BPS_PATH = '/v2/controller/debuggees/' + DEBUGGEE_ID + '/breakpoints';

var nock = require('nock');
nock.disableNetConnect();

var debuglet;
var bp = {
  id: 'test',
  location: { path: 'fixtures/foo.js', line: 2 }
};

describe(__filename, function(){
  beforeEach(function() {
    process.env.GCLOUD_PROJECT_NUM = 0;
    debuglet = new Debuglet(
      config, logger.create(config.logLevel, '@google/cloud-debug'));
    debuglet.once('started', function() {
      debuglet.debugletApi_.request_ = request; // Avoid authing.
    });
  });

  afterEach(function() {
    debuglet.stop();
  });

  it('should not start unless we know the project num', function(done) {
    delete process.env.GCLOUD_PROJECT_NUM;
    var scope = nock('http://metadata.google.internal')
      .get('/computeMetadata/v1/project/numeric-project-id')
      .reply(404);

    debuglet.once('error', function(err) {
      assert(err);
      scope.done();
      done();
    });
    debuglet.once('started', function() {
      assert.fail();
    });
    debuglet.start();
  });

  it('should complain if GCLOUD_PROJECT_NUM is not numeric', function(done) {
    process.env.GCLOUD_PROJECT_NUM='11020304f2934';

    debuglet.once('error', function(err) {
      assert(err);
      assert(err.message.indexOf('should be numeric') !== -1);
      done();
    });
    debuglet.once('started', function() {
      assert.fail();
    });
    debuglet.start();
  });

  it('should error if a package.json doesn\'t exist');

  it('should register successfully otherwise', function(done) {
    var scope = nock(API)
      .post(REGISTER_PATH)
      .reply(200, {
        debuggee: {
          id: DEBUGGEE_ID
        }
      });

    debuglet.once('registered', function(id) {
      assert(id === DEBUGGEE_ID);
      scope.done();
      done();
    });

    debuglet.start();
  });

  it('should pass source context to api if present', function(done) {
    process.chdir('test/fixtures');

    var scope = nock(API)
      .post(REGISTER_PATH, function(body) {
        return body.debuggee.sourceContexts[0] &&
          body.debuggee.sourceContexts[0].a === 5;
      })
      .reply(200, {
        debuggee: {
          id: DEBUGGEE_ID
        }
      });

    debuglet.once('registered', function(id) {
      assert(id === DEBUGGEE_ID);
      scope.done();
      process.chdir('../..');
      done();
    });

    debuglet.start();
  });

  it('should de-activate when the server responds with isDisabled');

  it('should re-register when registration expires');

  it('should fetch breakpoints');

  it('should re-fetch breakpoints on error', function(done) {
    this.timeout(6000);

    var scope = nock(API)
      .post(REGISTER_PATH)
      .reply(200, {
        debuggee: {
          id: DEBUGGEE_ID
        }
      })
      .post(REGISTER_PATH)
      .reply(200, {
        debuggee: {
          id: DEBUGGEE_ID
        }
      })
      .get(BPS_PATH)
      .reply(404)
      .get(BPS_PATH)
      .reply(409)
      .get(BPS_PATH)
      .reply(200, {
        breakpoints: [bp]
      });

    debuglet.once('registered', function reg(id) {
      assert(id === DEBUGGEE_ID);
      setTimeout(function() {
        assert.deepEqual(debuglet.activeBreakpointMap_.test, bp);
        scope.done();
        done();
      }, 1000);
    });

    debuglet.start();
  });

  it('should add a breakpoint');

  it('should report error on breakpoint set', function(done) {
    var errorBp = {
      id: 'test',
      location: { path: 'fixtures/foo', line: 2 }
    };

    var scope = nock(API)
      .post(REGISTER_PATH)
      .reply(200, {
        debuggee: {
          id: DEBUGGEE_ID
        }
      })
      .get(BPS_PATH)
      .reply(200, {
        breakpoints: [errorBp]
      })
      .put(BPS_PATH + '/test', function(body) {
        var status = body.breakpoint.status;
        return status.isError &&
          status.description.format.indexOf('Only files with .js extensions') !== -1;
      })
      .reply(200);

    debuglet.once('registered', function(id) {
      assert(id === DEBUGGEE_ID);
      setTimeout(function() {
        assert(!debuglet.activeBreakpointMap_.test);
        scope.done();
        done();
      }, 200);
    });

    debuglet.start();
  });

  it('should expire stale breakpoints', function(done) {
    var oldTimeout = config.breakpointExpirationSec;
    config.breakpointExpirationSec = 1;
    this.timeout(6000);
    var debuglet = new Debuglet(
      config, logger.create(config.logLevel, '@google/cloud-debug'));

    var scope = nock(API)
      .post(REGISTER_PATH)
      .reply(200, {
        debuggee: {
          id: DEBUGGEE_ID
        }
      })
      .get(BPS_PATH)
      .reply(200, {
        breakpoints: [bp]
      })
      .put(BPS_PATH + '/test', function(body) {
        return body.breakpoint.status.description.format ===
          'The snapshot has expired';
      })
      .reply(200);

    debuglet.once('started', function() {
      debuglet.debugletApi_.request_ = request; // Avoid authing.
    });
    debuglet.once('registered', function(id) {
      assert(id === DEBUGGEE_ID);
      setTimeout(function() {
        assert.deepEqual(debuglet.activeBreakpointMap_.test, bp);
        setTimeout(function() {
          assert(!debuglet.activeBreakpointMap_.test);
          scope.done();
          config.breakpointExpirationSec = oldTimeout;
          done();
        }, 1100);
      }, 500);
    });

    debuglet.start();
  });

  describe('map subtract', function() {
    it('should be correct', function() {
      var a = { a: 1, b: 2 };
      var b = { a: 1 };
      assert.deepEqual(Debuglet.mapSubtract(a, b), [2]);
      assert.deepEqual(Debuglet.mapSubtract(b, a), []);
      assert.deepEqual(Debuglet.mapSubtract(a, {}), [1, 2]);
      assert.deepEqual(Debuglet.mapSubtract({}, b), []);
    });
  });
});

