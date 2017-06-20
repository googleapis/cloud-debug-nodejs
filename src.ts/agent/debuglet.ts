/**
 * Copyright 2014 Google Inc. All Rights Reserved.
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

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import * as extend from 'extend';
import * as util from 'util';
import * as semver from 'semver';
import * as _ from 'lodash';
import * as metadata from 'gcp-metadata';
import * as common from '@google-cloud/common';

import * as v8debugapi from './v8debugapi';
import { Debuggee } from '../debuggee';
import { Controller } from '../controller';
// The following import syntax is used because './config' has a default export
import defaultConfig from './config';
import * as scanner from './scanner';
import { StatusMessage } from '../status-message';
import * as SourceMapper from './sourcemapper';
const pjson = require('../../package.json');

import * as assert from 'assert';

const ALLOW_EXPRESSIONS_MESSAGE = 'Expressions and conditions are not allowed' +
  ' by default. Please set the allowExpressions configuration option to true.' +
  ' See the debug agent documentation at https://goo.gl/ShSm6r.';
const NODE_VERSION_MESSAGE = 'Node.js version not supported. Node.js 5.2.0 and ' +
  ' versions older than 0.12 are not supported.';
const BREAKPOINT_ACTION_MESSAGE = 'The only currently supported breakpoint actions' +
  ' are CAPTURE and LOG.';

/**
 * Formats a breakpoint object prefixed with a provided message as a string
 * intended for logging.
 * @param {string} msg The message that prefixes the formatted breakpoint.
 * @param {Breakpoint} breakpoint The breakpoint to format.
 * @return {string} A formatted string.
 */
const formatBreakpoint = function(msg, breakpoint) {
  let text = msg + util.format('breakpoint id: %s,\n\tlocation: %s',
    breakpoint.id, util.inspect(breakpoint.location));
  if (breakpoint.createdTime) {
    const unixTime = parseInt(breakpoint.createdTime.seconds, 10);
    const date = new Date(unixTime * 1000); // to milliseconds.
    text += '\n\tcreatedTime: ' + date.toString();
  }
  if (breakpoint.condition) {
    text += '\n\tcondition: ' + util.inspect(breakpoint.condition);
  }
  if (breakpoint.expressions) {
    text += '\n\texpressions: ' + util.inspect(breakpoint.expressions);
  }
  return text;
};

/**
 * Formats a map of breakpoint objects prefixed with a provided message as a
 * string intended for logging.
 * @param {string} msg The message that prefixes the formatted breakpoint.
 * @param {Object.<string, Breakpoint>} breakpoints A map of breakpoints.
 * @return {string} A formatted string.
 */
const formatBreakpoints = function(msg, breakpoints) {
  return msg + Object.keys(breakpoints).map(function (b) {
    return formatBreakpoint('', breakpoints[b]);
  }).join('\n');
};

export class Debuglet extends EventEmitter {
  private config_;
  private debug_;
  private v8debug_;
  private running_;
  private project_;
  private fetcherActive_;
  private logger_;
  private debugletApi_;
  private debuggee_;
  private activeBreakpointMap_;
  private completedBreakpointMap_;

  /**
   * @param {Debug} debug - A Debug instance.
   * @param {object=} config - The option parameters for the Debuglet.
   * @event 'started' once the startup tasks are completed. Only called once.
   * @event 'stopped' if the agent stops due to a fatal error after starting. Only
   *     called once.
   * @event 'registered' once successfully registered to the debug api. May be
   *     emitted multiple times.
   * @event 'remotelyDisabled' if the debuggee is disabled by the server. May be
   *    called multiple times.
   * @constructor
   */
  constructor(debug, config) {
    super();

    /** @private {object} */
    this.config_ = Debuglet.normalizeConfig_(config);

    /** @private {Debug} */
    this.debug_ = debug;

    /**
     * @private {object} V8 Debug API. This can be null if the Node.js version
     *     is out of date.
     */
    this.v8debug_ = null;

    /** @private {boolean} */
    this.running_ = false;

    /** @private {string} */
    this.project_ = null;

    /** @private {boolean} */
    this.fetcherActive_ = false;

    /** @private {common.logger} */
    this.logger_ = new common.logger({
      level: common.logger.LEVELS[this.config_.logLevel],
      tag: pjson.name
    });

    /** @private {DebugletApi} */
    this.debugletApi_ = new Controller(this.debug_);

    /** @private {Debuggee} */
    this.debuggee_ = null;

    /** @private {Object.<string, Breakpoint>} */
    this.activeBreakpointMap_ = {};

    /** @private {Object.<string, Boolean>} */
    this.completedBreakpointMap_ = {};
  }

  static normalizeConfig_(config) {
    const envConfig = {
      logLevel: process.env.GCLOUD_DEBUG_LOGLEVEL,
      serviceContext: {
        service: process.env.GAE_SERVICE || process.env.GAE_MODULE_NAME,
        version: process.env.GAE_VERSION || process.env.GAE_MODULE_VERSION,
        // Debug UI expects GAE_MINOR_VERSION to be available for AppEngine, but
        // AppEngine Flex doesn't have this environment variable. We provide a
        // fake value as a work-around, but only on Flex (GAE_SERVICE will be
        // defined on Flex).
        minorVersion_:
            process.env.GAE_MINOR_VERSION ||
                (process.env.GAE_SERVICE ? 'fake-minor-version' : undefined)
      }
    };

    if (process.env.FUNCTION_NAME) {
      envConfig.serviceContext.service = process.env.FUNCTION_NAME;
      envConfig.serviceContext.version = 'unversioned';
    }

    return extend(true, {}, defaultConfig, config, envConfig);
  }

  /**
   * Starts the Debuglet. It is important that this is as quick as possible
   * as it is on the critical path of application startup.
   * @private
   */
  start() {
    const that = this;
    fs.stat(path.join(that.config_.workingDirectory, 'package.json'), function(err) {
      if (err && err.code === 'ENOENT') {
        that.logger_.error('No package.json located in working directory.');
        that.emit('initError', new Error('No package.json found.'));
        return;
      }
      let id;
      if (process.env.GAE_MINOR_VERSION) {
        id = 'GAE-' + process.env.GAE_MINOR_VERSION;
      }
      scanner.scan(!id, that.config_.workingDirectory, /.js$|.map$/,
          function(err, fileStats, hash) {
        if (err) {
          that.logger_.error('Error scanning the filesystem.', err);
          that.emit('initError', err);
          return;
        }

        const jsStats = fileStats.selectStats(/.js$/);
        const mapFiles = fileStats.selectFiles(/.map$/, process.cwd());
        SourceMapper.create(mapFiles, function(err, mapper) {
          if (err) {
            that.logger_.error('Error processing the sourcemaps.', err);
            that.emit('initError', err);
            return;
          }

          that.v8debug_ = v8debugapi.create(that.logger_, that.config_, jsStats, mapper);

          id = id || hash;

          that.logger_.info('Unique ID for this Application: ' + id);

          that.getProjectId_(function(err, project, onGCP) {
            if (err) {
              that.logger_.error('Unable to discover projectId. Please provide ' +
                                 'the projectId to be able to use the Debuglet',
                                 err);
              that.emit('initError', err);
              return;
            }

            that.getSourceContext_(function(err, sourceContext) {
              if (err) {
                that.logger_.warn('Unable to discover source context', err);
                // This is ignorable.
              }

              if (semver.satisfies(process.version, '5.2 || <4')) {
                // Using an unsupported version. We report an error message about the
                // Node.js version, but we keep on running. The idea is that the user
                // may miss the error message on the console. This way we can report the
                // error when the user tries to set a breakpoint.
                that.logger_.error(NODE_VERSION_MESSAGE);
              }

              // We can register as a debuggee now.
              that.logger_.debug('Starting debuggee, project', project);
              that.running_ = true;
              that.project_ = project;
              that.debuggee_ = Debuglet.createDebuggee(
                  project, id, that.config_.serviceContext, sourceContext,
                  that.config_.description, null, onGCP);
              that.scheduleRegistration_(0 /* immediately */);
              that.emit('started');
            });
          });
        });
      });
    });
  }

  /**
   * @private
   */
  static createDebuggee(projectId, uid, serviceContext, sourceContext, description,
                        errorMessage, onGCP) {
    const cwd = process.cwd();
    const mainScript = path.relative(cwd, process.argv[1]);

    const version = 'google.com/node-' + (onGCP ? 'gcp' : 'standalone') + '/v' +
                  pjson.version;
    let desc = process.title + ' ' + mainScript;

    const labels: any = {
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

      if (_.isString(serviceContext.minorVersion_)) {
        //          v--- intentional lowercase
        labels.minorversion = serviceContext.minorVersion_;
      }
    }

    if (!description && process.env.FUNCTION_NAME) {
      description = 'Function: ' + process.env.FUNCTION_NAME;
    }

    if (description) {
      desc += ' description:' + description;
    }

    const uniquifier = Debuglet._createUniquifier(desc, version, uid, sourceContext,
        labels);

    const statusMessage =
        errorMessage ?
            new StatusMessage(StatusMessage.UNSPECIFIED, errorMessage, true) :
            null;

    const properties = {
      project: projectId,
      uniquifier: uniquifier,
      description: desc,
      agentVersion: version,
      labels: labels,
      statusMessage: statusMessage,
      sourceContexts: [sourceContext]
    };
    return new Debuggee(properties);
  }

  /**
   * @private
   */
  getProjectId_(callback) {
    const that = this;

    // We need to figure out whether we are running on GCP. We can use our ability
    // to access the metadata service as a test for that.
    // TODO: change this to getProjectId in the future.
    // TODO: Determine if it is expected that the second argument (which was
    //       named `response`) is not used.
    metadata.project(
        'project-id', function(err, _, metadataProject) {
          // We should get an error if we are not on GCP.
          const onGCP = !err;

          // We perfer to use the locally available projectId as that is least
          // surprising to users.
          const project = that.debug_.options.projectId ||
                        process.env.GCLOUD_PROJECT || metadataProject;

          // We if don't have a projectId by now, we fail with an error.
          if (!project) {
            return callback(err);
          }
          return callback(null, project, onGCP);
        });
  }

  getSourceContext_(callback) {
    fs.readFile('source-context.json', 'utf8', function(err: any, data) {
      let sourceContext;
      if (!err) {
        try {
          sourceContext = JSON.parse(data);
        } catch (e) {
          // TODO: Fix casting `err` from an ErrnoException to a string
          err = 'Malformed source-context.json file: ' + e;
        }
      }
      // We keep on going even if there are errors.
      return callback(err, sourceContext);
    });
  }

  /**
   * @param {number} seconds
   * @private
   */
  scheduleRegistration_(seconds) {
    const that = this;

    function onError(err) {
      that.logger_.error('Failed to re-register debuggee ' +
        that.project_ + ': ' + err);
      that.scheduleRegistration_(Math.min((seconds + 1) * 2,
        that.config_.internal.maxRegistrationRetryDelay));
    }

    setTimeout(function() {
      if (!that.running_) {
        onError(new Error('Debuglet not running'));
        return;
      }

      that.debugletApi_.register(that.debuggee_, function(err, result) {
        if (err) {
          onError(err);
          return;
        }

        if (result.debuggee.isDisabled) {
          // Server has disabled this debuggee / debug agent.
          onError(new Error('Disabled by the server'));
          that.emit('remotelyDisabled');
          return;
        }

        that.logger_.info('Registered as debuggee:', result.debuggee.id);
        that.debuggee_.id = result.debuggee.id;
        that.emit('registered', result.debuggee.id);
        if (!that.fetcherActive_) {
          that.scheduleBreakpointFetch_(0);
        }
      });
    }, seconds * 1000).unref();
  }

  /**
   * @param {number} seconds
   * @private
   */
  scheduleBreakpointFetch_(seconds) {
    const that = this;

    that.fetcherActive_ = true;
    setTimeout(function() {
      if (!that.running_) {
        return;
      }
      assert(that.fetcherActive_);

      that.logger_.info('Fetching breakpoints');
      that.debugletApi_.listBreakpoints(that.debuggee_, function(err, response,
                                                                 body) {
        if (err) {
          that.logger_.error('Unable to fetch breakpoints – stopping fetcher',
                             err);
          that.fetcherActive_ = false;
          // We back-off from fetching breakpoints, and try to register again
          // after a while. Successful registration will restart the breakpoint
          // fetcher.
          that.scheduleRegistration_(
              that.config_.internal.registerDelayOnFetcherErrorSec);
          return;
        }

        switch (response.statusCode) {
          case 404:
            // Registration expired. Deactivate the fetcher and queue
            // re-registration, which will re-active breakpoint fetching.
            that.logger_.info('\t404 Registration expired.');
            that.fetcherActive_ = false;
            that.scheduleRegistration_(0 /*immediately*/);
            return;

          default:
            that.logger_.info('\t' + response.statusCode + ' completed.');
            if (body.wait_expired) {
              that.logger_.info('\tLong poll completed.');
              that.scheduleBreakpointFetch_(0/*immediately*/);
              return;
            }
            const bps = (body.breakpoints || []).filter(function(bp) {
              const action = bp.action || 'CAPTURE';
              if (action !== 'CAPTURE' && action !== 'LOG') {
                that.logger_.warn('Found breakpoint with invalid action:', action);
                bp.status = new StatusMessage(StatusMessage.UNSPECIFIED,
                  BREAKPOINT_ACTION_MESSAGE, true);
                that.rejectBreakpoint_(bp);
                return false;
              }
              return true;
            });
            that.updateActiveBreakpoints_(bps);
            if (Object.keys(that.activeBreakpointMap_).length) {
              that.logger_.info(formatBreakpoints('Active Breakpoints: ',
                that.activeBreakpointMap_));
            }
            that.scheduleBreakpointFetch_(that.config_.breakpointUpdateIntervalSec);
            return;
        }
      });
    }, seconds * 1000).unref();
  }

  /**
   * Given a list of server breakpoints, update our internal list of breakpoints
   * @param {Array.<Breakpoint>} breakpoints
   * @private
   */
  updateActiveBreakpoints_(breakpoints) {
    const that = this;
    const updatedBreakpointMap = this.convertBreakpointListToMap_(breakpoints);

    if (breakpoints.length) {
      that.logger_.info(formatBreakpoints('Server breakpoints: ',
        updatedBreakpointMap));
    }

    breakpoints.forEach(function(breakpoint) {

      if (!that.completedBreakpointMap_[breakpoint.id] &&
          !that.activeBreakpointMap_[breakpoint.id]) {

        // New breakpoint
        that.addBreakpoint_(breakpoint, function(err) {
          if (err) {
            that.completeBreakpoint_(breakpoint);
          }
        });

        // Schedule the expiry of server breakpoints.
        that.scheduleBreakpointExpiry_(breakpoint);
      }
    });

    // Remove completed breakpoints that the server no longer cares about.
    Debuglet.mapSubtract(this.completedBreakpointMap_, updatedBreakpointMap)
      .forEach(function(breakpoint){
        delete this.completedBreakpointMap_[breakpoint.id];
      }, this);

    // Remove active breakpoints that the server no longer care about.
    Debuglet.mapSubtract(this.activeBreakpointMap_, updatedBreakpointMap)
      .forEach(this.removeBreakpoint_, this);
  }

  /**
   * Array of breakpints get converted to Map of breakpoints, indexed by id
   * @param {Array.<Breakpoint>} breakpointList
   * @return {Object.<string, Breakpoint>} A map of breakpoint IDs to breakpoints.
   * @private
   */
  convertBreakpointListToMap_(breakpointList) {
    const map = {};
    breakpointList.forEach(function(breakpoint) {
      map[breakpoint.id] = breakpoint;
    });
    return map;
  }

  /**
   * @param {Breakpoint} breakpoint
   * @private
   */
  removeBreakpoint_(breakpoint) {
    this.logger_.info('\tdeleted breakpoint', breakpoint.id);
    delete this.activeBreakpointMap_[breakpoint.id];
    if (this.v8debug_) {
      this.v8debug_.clear(breakpoint);
    }
  }

  /**
   * @param {Breakpoint} breakpoint
   * @return {boolean} false on error
   * @private
   */
  addBreakpoint_(breakpoint, cb) {
    const that = this;

    if (!that.config_.allowExpressions &&
        (breakpoint.condition || breakpoint.expressions)) {
      that.logger_.error(ALLOW_EXPRESSIONS_MESSAGE);
      breakpoint.status = new StatusMessage(StatusMessage.UNSPECIFIED,
        ALLOW_EXPRESSIONS_MESSAGE, true);
      setImmediate(function() { cb(ALLOW_EXPRESSIONS_MESSAGE); });
      return;
    }

    if (semver.satisfies(process.version, '5.2 || <4')) {
      const message = NODE_VERSION_MESSAGE;
      that.logger_.error(message);
      breakpoint.status = new StatusMessage(StatusMessage.UNSPECIFIED,
        message, true);
      setImmediate(function() { cb(message); });
      return;
    }

    that.v8debug_.set(breakpoint, function(err) {
      if (err) {
        cb(err);
        return;
      }

      that.logger_.info('\tsuccessfully added breakpoint  ' + breakpoint.id);
      that.activeBreakpointMap_[breakpoint.id] = breakpoint;

      if (breakpoint.action === 'LOG') {
        that.v8debug_.log(breakpoint,
          function(fmt, exprs) {
            console.log('LOGPOINT:', Debuglet.format(fmt, exprs));
          },
          function() {
            return that.completedBreakpointMap_[breakpoint.id];
          });
      } else {
        that.v8debug_.wait(breakpoint, function(err) {
          if (err) {
            that.logger_.error(err);
            cb(err);
            return;
          }

          that.logger_.info('Breakpoint hit!: ' + breakpoint.id);
          that.completeBreakpoint_(breakpoint);
        });
      }
    });
  }

  /**
   * Update the server that the breakpoint has been completed (captured, or
   * expired).
   * @param {Breakpoint} breakpoint
   * @private
   */
  completeBreakpoint_(breakpoint) {
    const that = this;

    that.logger_.info('\tupdating breakpoint data on server', breakpoint.id);
    that.debugletApi_.updateBreakpoint(
        that.debuggee_, breakpoint, function(err /*, body*/) {
          if (err) {
            that.logger_.error('Unable to complete breakpoint on server', err);
          } else {
            that.completedBreakpointMap_[breakpoint.id] = true;
            that.removeBreakpoint_(breakpoint);
          }
        });
  }

  /**
   * Update the server that the breakpoint cannot be handled.
   * @param {Breakpoint} breakpoint
   * @private
   */
  rejectBreakpoint_(breakpoint) {
    const that = this;

    that.debugletApi_.updateBreakpoint(
        that.debuggee_, breakpoint, function(err /*, body*/) {
          if (err) {
            that.logger_.error('Unable to complete breakpoint on server', err);
          }
        });
  }

  /**
   * This schedules a delayed operation that will delete the breakpoint from the
   * server after the expiry period.
   * FIXME: we should cancel the timer when the breakpoint completes. Otherwise
   * we hold onto the closure memory until the breapointExpirateion timeout.
   * @param {Breakpoint} breakpoint Server breakpoint object
   * @private
   */
  scheduleBreakpointExpiry_(breakpoint) {
    const that = this;

    const now = Date.now() / 1000;
    const createdTime = breakpoint.createdTime ?
      parseInt(breakpoint.createdTime.seconds) : now;
    const expiryTime = createdTime + that.config_.breakpointExpirationSec;

    setTimeout(function() {
      that.logger_.info('Expiring breakpoint ' + breakpoint.id);
      breakpoint.status = {
        description: {
          format: 'The snapshot has expired'
        },
        isError: true,
        refersTo: StatusMessage.BREAKPOINT_AGE
      };
      that.completeBreakpoint_(breakpoint);
    }, (expiryTime - now) * 1000).unref();
  }

  /**
   * Stops the Debuglet. This is for testing purposes only. Stop should only be
   * called on a agent that has started (i.e. emitted the 'started' event).
   * Calling this while the agent is initializing may not necessarily stop all
   * pending operations.
   */
  stop() {
    assert.ok(this.running_, 'stop can only be called on a running agent');
    this.logger_.debug('Stopping Debuglet');
    this.running_ = false;
    this.emit('stopped');
  }

  /**
   * Performs a set subtract. Returns A - B given maps A, B.
   * @return {Array.<Breakpoint>} A array containing elements from A that are not
   *     in B.
   */
  static mapSubtract(A, B) {
    const removed = [];
    for (let key in A) {
      if (!B[key]) {
        removed.push(A[key]);
      }
    }
    return removed;
  }

  /**
   * Formats the message base with placeholders `$0`, `$1`, etc
   * by substituting the provided expressions. If more expressions
   * are given than placeholders extra expressions are dropped.
   */
  static format(base, exprs) {
    const tokens = Debuglet._tokenize(base, exprs.length);
    for (let i = 0; i < tokens.length; i++) {
      if (!tokens[i].v) {
        continue;
      }
      if (tokens[i].v === '$$') {
        tokens[i] = '$';
        continue;
      }
      for (let j = 0; j < exprs.length; j++) {
        if (tokens[i].v === '$' + j) {
          tokens[i] = exprs[j];
          break;
        }
      }
    }
    return tokens.join('');
  }

  static _tokenize(base, exprLength) {
    let acc = Debuglet._delimit(base, '$$');
    for (let i = exprLength - 1; i >= 0; i--) {
      const newAcc = [];
      for (let j = 0; j < acc.length; j++) {
        if (acc[j].v) {
          newAcc.push(acc[j]);
        } else {
          newAcc.push.apply(newAcc, Debuglet._delimit(acc[j], '$' + i));
        }
      }
      acc = newAcc;
    }
    return acc;
  }

  static _delimit(source, delim) {
    const pieces = source.split(delim);
    const dest = [];
    dest.push(pieces[0]);
    for (let i = 1; i < pieces.length; i++) {
      dest.push({ v: delim }, pieces[i]);
    }
    return dest;
  }

  static _createUniquifier(desc, version, uid, sourceContext,
    labels) {
    const uniquifier = desc + version + uid + JSON.stringify(sourceContext) +
      JSON.stringify(labels);
    return crypto.createHash('sha1').update(uniquifier).digest('hex');
  }
}
