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

/**
 * Find a unique id that can be used to identify this application to the
 * cloud debug server. This requires that there is a package.json in your
 * top level application directory (baseDir). The UID may be computed by
 * either looking at the GAE or GKE environment (cheap) or, if running locally
 * by taking a hash of the contents of your js files.
 * @param {string} baseDir top level with package.json
 * @param {function} callback error-back style callback
 */
module.exports.get = function (baseDir, callback) {
  // Running on Google App Engine?
  if (process.env.GAE_MINOR_VERSION) {
    callback(null, 'GAE-' + process.env.GAE_MINOR_VERSION);
    return;
  }

  // Running on Google Container Engine?
  // TODO: check the Kubernetes API

  // All else fails, try to compute a hash of the source files.
  // This will require a scan of the whole subtree of baseDir, so we want to
  // avoid accidentally doing a full scan of the filesystem. A good way to
  // ensure we are looking at a relevant directory is to check if the directory
  // contains a package.json file.
  //
  if (baseDir.substr(-1) !== '/') {
    baseDir += '/';
  }
  var package_json = baseDir + 'package.json';
  require('fs').exists(package_json, function (exists) {
    if (!exists) {
      callback(new Error('Unable to find a way to compute unique ID for the application'));
      return;
    }

    var hasher = require('./hasher.js');
    hasher.compute(baseDir, callback);
  });
};
