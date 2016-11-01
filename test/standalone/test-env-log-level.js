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

process.env.GCLOUD_DEBUG_LOGLEVEL = 3;

var assert = require('assert');

describe('should respect environment variables', function() {
  it('should respect GCLOUD_DEBUG_LOGLEVEL', function() {
    var agent = require('../../');
    agent.start();
    var logger = agent.private_.logger_;
    var STRING1 = 'jjjjjjjjjjjjjjjjjfjfjfjf';
    var STRING2 = 'kkkkkkkfkfkfkfkfkkffkkkk';

    var buffer = [];
    var oldLog = console.log;

    console.log = function () {
      buffer = buffer.concat([].slice.call(arguments));
    };
    logger.info(STRING1);
    logger.debug(STRING2);
    console.log = oldLog;

    assert(buffer.indexOf(STRING1) !== -1);
    assert(buffer.indexOf(STRING2) === -1);
  });

});
