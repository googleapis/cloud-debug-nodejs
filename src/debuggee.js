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

var crypto = require('crypto');
var path = require('path');
var pjson = require('../package.json');
var StatusMessage = require('./status-message.js');
var _ = require('lodash');

/**
 * Creates a Debuggee service object.
 * @ref https://cloud.google.com/debugger/api/reference/rest/v2/Debuggee
 *
 * @param {string} projectId - Google Cloud Project ID
 * @param {string} uid - unique identified for the source code on this instance.
 * @param {?object} serviceContext
 * @param {string} serviceContext.service - A string identifying the service/
 *     module that this instance belongs to.
 * @param {string} serviceContext.version - A string identifying the version of
 *     the service.
 * @param {?object} sourceContext
 * @param {?string} description - A user specified string identifying this
 *     debuggable instance.
 * @param {?string} errorMessage - A error string to register this as a erroring
 *     debuggable instance. This is useful if we have a problem starting the
 *     debugger support, and want to report to the API so that the users has a
 *     way of noticing.
 * @param {?boolean} onGCP - set to true when the debuggee is running inside
 *     Google Cloud Platform.
 */
function Debuggee(projectId, uid, serviceContext, sourceContext, description,
                  errorMessage, onGCP) {
  if (!(this instanceof Debuggee)) {
    return new Debuggee(projectId, uid, serviceContext, sourceContext,
                        description, errorMessage, onGCP);
  }

  if (!_.isString(projectId)) {
    throw new Error('projectId must be a string');
  }
  if (!_.isString(uid)) {
    throw new Error('uid must be a string');
  }

  var cwd = process.cwd();
  var mainScript = path.relative(cwd, process.argv[1]);

  var version = 'google.com/node-' + (onGCP ? 'gcp' : 'standalone') + '/v' +
                pjson.version;
  var desc = process.title + ' ' + mainScript;

  var labels = {
    'main script': mainScript,
    'process.title': process.title,
    'node version': process.versions.node,
    'V8 version': process.versions.v8,
    'agent.name': pjson.name,
    'agent.version': pjson.version,
    'projectid': projectId
  };

  if (serviceContext) {
    if (_.isString(serviceContext.service) &&
        serviceContext.service !== 'default') {
      // As per app-engine-ids, the module label is not reported
      // when it happens to be 'default'.
      labels.module = serviceContext.service;
      desc += ' module:' + serviceContext.service;
    }

    if (_.isString(serviceContext.version)) {
      labels.version = serviceContext.version;
      desc += ' version:' + serviceContext.version;
    }
  }

  if (description) {
    desc += ' description:' + description;
  }

  var uniquifier =
      desc + version + uid + sourceContext + JSON.stringify(labels);
  uniquifier = crypto.createHash('sha1').update(uniquifier).digest('hex');

  if (errorMessage) {
    this.statusMessage =
        new StatusMessage(StatusMessage.UNSPECIFIED, errorMessage, true);
  }

  this.project = projectId;
  this.uniquifier = uniquifier;
  this.description = desc;
  this.agentVersion = version;
  this.labels = labels;
  if (sourceContext) {
    this.sourceContexts = [sourceContext];
  }
}

module.exports = Debuggee;
