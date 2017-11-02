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

import {AuthenticationConfig, Common} from '../types/common';
const common: Common = require('@google-cloud/common');

import * as crypto from 'crypto';
import {EventEmitter} from 'events';
import * as extend from 'extend';
import * as dns from 'dns';
import * as fs from 'fs';

import * as metadata from 'gcp-metadata';

import * as _ from 'lodash';
import * as path from 'path';
import * as semver from 'semver';
import * as util from 'util';
import * as utils from './util/utils';
import * as http from 'http';

import {Controller} from './controller';
import {Debuggee} from '../debuggee';
import {StatusMessage} from '../client/stackdriver/status-message';

// The following import syntax is used because './config' has a default export
import defaultConfig from './config';
import * as scanner from './io/scanner';
import * as SourceMapper from './io/sourcemapper';
import * as debugapi from './v8/debugapi';

import * as assert from 'assert';

import * as stackdriver from '../types/stackdriver';
import {DebugAgentConfig} from './config';
import {Debug, PackageInfo} from '../client/stackdriver/debug';
import {Logger} from '../types/common';
import {DebugApi} from './v8/debugapi';

const promisify = require('util.promisify');

const ALLOW_EXPRESSIONS_MESSAGE = 'Expressions and conditions are not allowed' +
    ' by default. Please set the allowExpressions configuration option to true.' +
    ' See the debug agent documentation at https://goo.gl/ShSm6r.';
const NODE_VERSION_MESSAGE =
    'Node.js version not supported. Node.js 5.2.0 and ' +
    ' versions older than 0.12 are not supported.';
const BREAKPOINT_ACTION_MESSAGE =
    'The only currently supported breakpoint actions' +
    ' are CAPTURE and LOG.';

// PROMISE_RESOLVE_CUT_OFF_IN_MILLISECONDS is a heuristic that we set to force
// the debug agent to return a promise when isReady is called in
// isReadyManager. The value is the average of Stackdriver debugger hanging
// get duration (40s) and TCP time-out on GCF (540s)
const PROMISE_RESOLVE_CUT_OFF_IN_MILLISECONDS = 290 * 1000;

/**
 * Formats a breakpoint object prefixed with a provided message as a string
 * intended for logging.
 * @param {string} msg The message that prefixes the formatted breakpoint.
 * @param {Breakpoint} breakpoint The breakpoint to format.
 * @return {string} A formatted string.
 */
const formatBreakpoint = function(
    msg: string, breakpoint: stackdriver.Breakpoint): string {
  let text = msg +
      util.format(
          'breakpoint id: %s,\n\tlocation: %s', breakpoint.id,
          util.inspect(breakpoint.location));
  if (breakpoint.createdTime) {
    const unixTime = parseInt(breakpoint.createdTime.seconds, 10);
    const date = new Date(unixTime * 1000);  // to milliseconds.
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
const formatBreakpoints = function(
    msg: string, breakpoints: {[key: string]: stackdriver.Breakpoint}): string {
  return msg +
      Object.keys(breakpoints)
          .map(function(b) {
            return formatBreakpoint('', breakpoints[b]);
          })
          .join('\n');
};

/**
 * CachedPromise stores a promise for a limited time. Its member function get()
 * will initially create a promise, or create a promise when previous promise
 * stales, then return that promise. resolve() will resolve the stored promise.
 */
export class CachedPromise {
  private promise: Promise<void>;
  private promiseResolve: (() => void)|null;
  private promiseResolvedTimestamp = -Infinity;
  private timeUntilStaleMS: number;
  constructor(timeUntilStaleMS: number) {
    this.timeUntilStaleMS = timeUntilStaleMS;
    this.promise = new Promise<void>((resolve) => {
      this.promiseResolve = resolve;
    });
  }
  get(): Promise<void> {
    const diff = Date.now() - this.promiseResolvedTimestamp;
    if (diff > this.timeUntilStaleMS) {
      this.promise = new Promise<void>((resolve) => {
        this.promiseResolve = resolve;
      });
    }
    return this.promise;
  }

  resolve(): void {
    this.promiseResolvedTimestamp = Date.now();
    if (this.promiseResolve) {
      this.promiseResolve();
      this.promiseResolve = null;
    }
  }
}

export class Debuglet extends EventEmitter {
  private debug_: Debug;
  private v8debug_: DebugApi|null;
  private running_: boolean;
  private project_: string|null;
  private controller_: Controller;
  private completedBreakpointMap_: {[key: string]: boolean};

  private cachedPromise =
      new CachedPromise(PROMISE_RESOLVE_CUT_OFF_IN_MILLISECONDS);
  // Exposed for testing
  config_: DebugAgentConfig;
  fetcherActive_: boolean;
  logger_: Logger;
  debuggee_: Debuggee|null;
  activeBreakpointMap_: {[key: string]: stackdriver.Breakpoint};

  /**
   * @param {Debug} debug - A Debug instance.
   * @param {object=} config - The option parameters for the Debuglet.
   * @event 'started' once the startup tasks are completed. Only called once.
   * @event 'stopped' if the agent stops due to a fatal error after starting.
   * Only called once.
   * @event 'registered' once successfully registered to the debug api. May be
   *     emitted multiple times.
   * @event 'remotelyDisabled' if the debuggee is disabled by the server. May be
   *    called multiple times.
   * @constructor
   */
  constructor(debug: Debug, config: DebugAgentConfig) {
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
      tag: this.debug_.packageInfo.name
    });

    /** @private {DebugletApi} */
    this.controller_ = new Controller(this.debug_);

    /** @private {Debuggee} */
    this.debuggee_ = null;

    /** @private {Object.<string, Breakpoint>} */
    this.activeBreakpointMap_ = {};

    /** @private {Object.<string, Boolean>} */
    this.completedBreakpointMap_ = {};
  }

  static normalizeConfig_(config: DebugAgentConfig): DebugAgentConfig {
    const envConfig = {
      logLevel: process.env.GCLOUD_DEBUG_LOGLEVEL,
      serviceContext: {
        service: process.env.GAE_SERVICE || process.env.GAE_MODULE_NAME,
        version: process.env.GAE_VERSION || process.env.GAE_MODULE_VERSION,
        // Debug UI expects GAE_MINOR_VERSION to be available for AppEngine, but
        // AppEngine Flex doesn't have this environment variable. We provide a
        // fake value as a work-around, but only on Flex (GAE_SERVICE will be
        // defined on Flex).
        minorVersion_: process.env.GAE_MINOR_VERSION ||
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
  async start(): Promise<void> {
    const that = this;
    process.on('warning', (warning) => {
      if ((warning as any).code ===
          'INSPECTOR_ASYNC_STACK_TRACES_NOT_AVAILABLE') {
        that.logger_.info(utils.messages.ASYNC_TRACES_WARNING);
      }
    });

    const stat = promisify(fs.stat);

    try {
      // TODO: Address the fact that `that.config_.workingDirectory` could
      //       be `null`.
      await stat(
          path.join(that.config_.workingDirectory as string, 'package.json'));
    } catch (err) {
      that.logger_.error('No package.json located in working directory.');
      that.emit('initError', new Error('No package.json found.'));
      return;
    }

    // TODO: Verify that it is fine for `id` to be undefined.
    let id: string|undefined;
    if (process.env.GAE_MINOR_VERSION) {
      id = 'GAE-' + process.env.GAE_MINOR_VERSION;
    }

    let fileStats: scanner.ScanResults;
    try {
      // TODO: Address the case when `that.config_.workingDirectory` is
      //       `null`.
      fileStats = await scanner.scan(
          !id, that.config_.workingDirectory as string, /.js$|.map$/);
    } catch (err) {
      that.logger_.error('Error scanning the filesystem.', err);
      that.emit('initError', err);
      return;
    }

    const jsStats = fileStats.selectStats(/.js$/);
    const mapFiles = fileStats.selectFiles(/.map$/, process.cwd());
    SourceMapper.create(mapFiles, async function(err3, sourcemapper) {
      if (err3) {
        that.logger_.error('Error processing the sourcemaps.', err3);
        that.emit('initError', err3);
        return;
      }

      // At this point err3 being falsy implies sourcemapper is defined
      const mapper = sourcemapper as SourceMapper.SourceMapper;

      that.v8debug_ =
          debugapi.create(that.logger_, that.config_, jsStats, mapper);

      id = id || fileStats.hash;

      that.logger_.info('Unique ID for this Application: ' + id);

      const onGCP = await Debuglet.runningOnGCP();
      let project: string;
      try {
        project = await Debuglet.getProjectId(that.debug_.options);
      } catch (err) {
        that.logger_.error(err.message);
        that.emit('initError', err);
        return;
      }

      if (onGCP &&
          (!that.config_.serviceContext ||
           !that.config_.serviceContext.service)) {
        // If on GCP, check if the clusterName instance attribute is availble.
        // Use this as the service context for better service identification on
        // GKE.
        try {
          const clusterName = await Debuglet.getClusterNameFromMetadata();
          that.config_.serviceContext = {
            service: clusterName,
            version: 'unversioned',
            minorVersion_: undefined
          };
        } catch (err) {
          /* we are not running on GKE - Ignore error. */
        }
      }

      that.getSourceContext_(function(err5, sourceContext) {
        if (err5) {
          that.logger_.warn('Unable to discover source context', err5);
          // This is ignorable.
        }

        if (semver.satisfies(process.version, '5.2 || <4')) {
          // Using an unsupported version. We report an error
          // message about the Node.js version, but we keep on
          // running. The idea is that the user may miss the error
          // message on the console. This way we can report the
          // error when the user tries to set a breakpoint.
          that.logger_.error(NODE_VERSION_MESSAGE);
        }

        // We can register as a debuggee now.
        that.logger_.debug('Starting debuggee, project', project);
        that.running_ = true;
        // TODO: Address the case where `project` is `undefined`.
        that.project_ = project;
        that.debuggee_ = Debuglet.createDebuggee(
            // TODO: Address the case when `id` is `undefined`.
            project, id as string, that.config_.serviceContext, sourceContext,
            onGCP, that.debug_.packageInfo, that.config_.description,
            undefined);
        that.scheduleRegistration_(0 /* immediately */);
        that.emit('started');
      });

    });
  }

  /**
   * isReady is designed to support debug agent on Google Cloud Function (GCF).
   * GCF is a serverless environment and we wanted to make sure debug agent
   * always captures the snapshots. When using the debug agent with GCF, isReady
   * needs to be called first to acquire a promise. This promise will be
   * resolved after debug agent listing all breakpoints. GCF can complete and
   * call the callback afterwards.
   */
  isReady(): Promise<void> {
    return this.cachedPromise.get();
  }

  /**
   * @private
   */
  // TODO: Determine the type of sourceContext
  static createDebuggee(
      projectId: string, uid: string,
      serviceContext:
          {service?: string, version?: string, minorVersion_?: string},
      sourceContext: {[key: string]: string}, onGCP: boolean,
      packageInfo: PackageInfo, description?: string,
      errorMessage?: string): Debuggee {
    const cwd = process.cwd();
    const mainScript = path.relative(cwd, process.argv[1]);

    const version = 'google.com/node-' + (onGCP ? 'gcp' : 'standalone') + '/v' +
        packageInfo.version;
    let desc = process.title + ' ' + mainScript;

    const labels: {[key: string]: string} = {
      'main script': mainScript,
      'process.title': process.title,
      'node version': process.versions.node,
      'V8 version': process.versions.v8,
      'agent.name': packageInfo.name,
      'agent.version': packageInfo.version,
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

    const uniquifier =
        Debuglet._createUniquifier(desc, version, uid, sourceContext, labels);

    const statusMessage = errorMessage ?
        new StatusMessage(StatusMessage.UNSPECIFIED, errorMessage, true) :
        undefined;

    const properties = {
      project: projectId,
      uniquifier: uniquifier,
      description: desc,
      agentVersion: version,
      labels: labels,
      statusMessage: statusMessage,
      sourceContexts: [sourceContext],
      packageInfo: packageInfo
    };
    return new Debuggee(properties);
  }

  static async getProjectId(options: AuthenticationConfig): Promise<string> {
    const project = options.projectId || process.env.GCLOUD_PROJECT ||
        await this.getProjectIdFromMetadata();
    if (!project) {
      const msg = 'Unable to discover projectId. Please provide the ' +
          'projectId to be able to use the Debug agent';
      throw new Error(msg);
    }
    return project;
  }

  static async runningOnGCP(): Promise<boolean> {
    const lookup = promisify(dns.lookup);
    try {
      await lookup('metadata.google.internal.');
      return true;
    } catch (err) {
      // Take failure to resolve metadata service to indicate that we are not
      // running on GCP.
      return false;
    }
  }

  static getProjectIdFromMetadata(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      metadata.project(
          'project-id', (err: Error, _res: any, projectId: string) => {
            err ? reject(err) : resolve(projectId);
          });
    });
  }

  static getClusterNameFromMetadata(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      metadata.instance(
          'attributes/cluster-name',
          (err: Error, _res: any, clusterName: string) => {
            err ? reject(err) : resolve(clusterName);
          });
    });
  }

  getSourceContext_(
      callback:
          (err: Error|string, sourceContext: {[key: string]: string}) => void):
      void {
    fs.readFile(
        'source-context.json', 'utf8', function(err: string|Error, data) {
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
  scheduleRegistration_(seconds: number): void {
    const that = this;

    function onError(err: Error) {
      that.logger_.error(
          'Failed to re-register debuggee ' + that.project_ + ': ' + err);
      that.scheduleRegistration_(Math.min(
          (seconds + 1) * 2, that.config_.internal.maxRegistrationRetryDelay));
    }

    setTimeout(function() {
      if (!that.running_) {
        onError(new Error('Debuglet not running'));
        return;
      }

      // TODO: Handle the case when `that.debuggee_` is null.
      that.controller_.register(
          that.debuggee_ as Debuggee,
          function(err: Error|null, result?: {debuggee: Debuggee;}) {
            if (err) {
              onError(err);
              return;
            }

            // TODO: It appears that the Debuggee class never has an
            // `isDisabled`
            //       field set.  Determine if this is a bug or if the following
            //       code is not needed.
            // TODO: Handle the case when `result` is undefined.
            if ((result as {debuggee: Debuggee}).debuggee.isDisabled) {
              // Server has disabled this debuggee / debug agent.
              onError(new Error('Disabled by the server'));
              that.emit('remotelyDisabled');
              return;
            }

            // TODO: Handle the case when `result` is undefined.
            that.logger_.info(
                'Registered as debuggee:',
                (result as {debuggee: Debuggee}).debuggee.id);
            // TODO: Handle the case when `that.debuggee_` is null.
            // TODO: Handle the case when `result` is undefined.
            (that.debuggee_ as Debuggee).id =
                (result as {debuggee: Debuggee}).debuggee.id;
            // TODO: Handle the case when `result` is undefined.
            that.emit(
                'registered', (result as {debuggee: Debuggee}).debuggee.id);
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
  scheduleBreakpointFetch_(seconds: number): void {
    const that = this;

    that.fetcherActive_ = true;
    setTimeout(function() {
      if (!that.running_) {
        return;
      }
      assert(that.fetcherActive_);

      that.logger_.info('Fetching breakpoints');
      // TODO: Address the case when `that.debuggee` is `null`.
      that.controller_.listBreakpoints(
          (that.debuggee_ as Debuggee), function(err: Error, response, body) {
            if (err) {
              that.logger_.error(
                  'Unable to fetch breakpoints – stopping fetcher', err);
              that.fetcherActive_ = false;
              // We back-off from fetching breakpoints, and try to register
              // again after a while. Successful registration will restart the
              // breakpoint fetcher.
              that.scheduleRegistration_(
                  that.config_.internal.registerDelayOnFetcherErrorSec);
              return;
            }

            // TODO: Address the case where `response` is `undefined`.
            switch ((response as http.ServerResponse).statusCode) {
              case 404:
                // Registration expired. Deactivate the fetcher and queue
                // re-registration, which will re-active breakpoint fetching.
                that.logger_.info('\t404 Registration expired.');
                that.fetcherActive_ = false;
                that.scheduleRegistration_(0 /*immediately*/);
                return;

              default:
                // TODO: Address the case where `response` is `undefined`.
                that.logger_.info(
                    '\t' + (response as http.ServerResponse).statusCode +
                    ' completed.');
                if (!body) {
                  that.logger_.error('\tinvalid list response: empty body');
                  that.scheduleBreakpointFetch_(
                      that.config_.breakpointUpdateIntervalSec);
                  return;
                }
                if (body.waitExpired) {
                  that.logger_.info('\tLong poll completed.');
                  that.scheduleBreakpointFetch_(0 /*immediately*/);
                  return;
                }
                const bps = (body.breakpoints ||
                             []).filter(function(bp: stackdriver.Breakpoint) {
                  const action = bp.action || 'CAPTURE';
                  if (action !== 'CAPTURE' && action !== 'LOG') {
                    that.logger_.warn(
                        'Found breakpoint with invalid action:', action);
                    bp.status = new StatusMessage(
                        StatusMessage.UNSPECIFIED, BREAKPOINT_ACTION_MESSAGE,
                        true);
                    that.rejectBreakpoint_(bp);
                    return false;
                  }
                  return true;
                });
                that.updateActiveBreakpoints_(bps);
                if (Object.keys(that.activeBreakpointMap_).length) {
                  that.logger_.info(formatBreakpoints(
                      'Active Breakpoints: ', that.activeBreakpointMap_));
                }
                that.scheduleBreakpointFetch_(
                    that.config_.breakpointUpdateIntervalSec);
                that.cachedPromise.resolve();
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
  updateActiveBreakpoints_(breakpoints: stackdriver.Breakpoint[]): void {
    const that = this;
    const updatedBreakpointMap = this.convertBreakpointListToMap_(breakpoints);

    if (breakpoints.length) {
      that.logger_.info(
          formatBreakpoints('Server breakpoints: ', updatedBreakpointMap));
    }

    breakpoints.forEach(function(breakpoint: stackdriver.Breakpoint) {

      // TODO: Address the case when `breakpoint.id` is `undefined`.
      if (!that.completedBreakpointMap_[breakpoint.id as string] &&
          !that.activeBreakpointMap_[breakpoint.id as string]) {
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
        .forEach(function(breakpoint) {
          // TODO: FIXME: breakpoint is a boolean here that doesn't have an id
          //              field.  It is possible that breakpoint.id is always
          //              undefined!
          // TODO: Make sure the use of `that` here is correct.
          delete that.completedBreakpointMap_[(breakpoint as any).id];
        });

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
  convertBreakpointListToMap_(breakpointList: stackdriver.Breakpoint[]):
      {[key: string]: stackdriver.Breakpoint} {
    const map: {[id: string]: stackdriver.Breakpoint} = {};
    breakpointList.forEach(function(breakpoint) {
      // TODO: Address the case when `breakpoint.id` is `undefined`.
      map[breakpoint.id as string] = breakpoint;
    });
    return map;
  }

  /**
   * @param {Breakpoint} breakpoint
   * @private
   */
  removeBreakpoint_(breakpoint: stackdriver.Breakpoint): void {
    this.logger_.info('\tdeleted breakpoint', breakpoint.id);
    // TODO: Address the case when `breakpoint.id` is `undefined`.
    delete this.activeBreakpointMap_[breakpoint.id as string];
    if (this.v8debug_) {
      this.v8debug_.clear(breakpoint, (err) => {
        if (err) this.logger_.error(err);
      });
    }
  }

  /**
   * @param {Breakpoint} breakpoint
   * @return {boolean} false on error
   * @private
   */
  addBreakpoint_(
      breakpoint: stackdriver.Breakpoint,
      cb: (ob: Error|string) => void): void {
    const that = this;

    if (!that.config_.allowExpressions &&
        (breakpoint.condition || breakpoint.expressions)) {
      that.logger_.error(ALLOW_EXPRESSIONS_MESSAGE);
      breakpoint.status = new StatusMessage(
          StatusMessage.UNSPECIFIED, ALLOW_EXPRESSIONS_MESSAGE, true);
      setImmediate(function() {
        cb(ALLOW_EXPRESSIONS_MESSAGE);
      });
      return;
    }

    if (semver.satisfies(process.version, '5.2 || <4')) {
      const message = NODE_VERSION_MESSAGE;
      that.logger_.error(message);
      breakpoint.status =
          new StatusMessage(StatusMessage.UNSPECIFIED, message, true);
      setImmediate(function() {
        cb(message);
      });
      return;
    }

    // TODO: Address the case when `that.v8debug_` is `null`.
    (that.v8debug_ as DebugApi).set(breakpoint, function(err1) {
      if (err1) {
        cb(err1);
        return;
      }

      that.logger_.info('\tsuccessfully added breakpoint  ' + breakpoint.id);
      // TODO: Address the case when `breakpoint.id` is `undefined`.
      that.activeBreakpointMap_[breakpoint.id as string] = breakpoint;

      if (breakpoint.action === 'LOG') {
        // TODO: Address the case when `that.v8debug_` is `null`.
        (that.v8debug_ as DebugApi)
            .log(
                breakpoint,
                function(fmt: string, exprs: string[]) {
                  console.log('LOGPOINT:', Debuglet.format(fmt, exprs));
                },
                function() {
                  // TODO: Address the case when `breakpoint.id` is `undefined`.
                  return that.completedBreakpointMap_[breakpoint.id as string];
                });
      } else {
        // TODO: Address the case when `that.v8debug_` is `null`.
        (that.v8debug_ as DebugApi).wait(breakpoint, function(err2) {
          if (err2) {
            that.logger_.error(err2);
            cb(err2);
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
  completeBreakpoint_(breakpoint: stackdriver.Breakpoint): void {
    const that = this;

    that.logger_.info('\tupdating breakpoint data on server', breakpoint.id);
    that.controller_.updateBreakpoint(
        // TODO: Address the case when `that.debuggee_` is `null`.
        (that.debuggee_ as Debuggee), breakpoint, function(err /*, body*/) {
          if (err) {
            that.logger_.error('Unable to complete breakpoint on server', err);
          } else {
            // TODO: Address the case when `breakpoint.id` is `undefined`.
            that.completedBreakpointMap_[breakpoint.id as string] = true;
            that.removeBreakpoint_(breakpoint);
          }
        });
  }

  /**
   * Update the server that the breakpoint cannot be handled.
   * @param {Breakpoint} breakpoint
   * @private
   */
  rejectBreakpoint_(breakpoint: stackdriver.Breakpoint): void {
    const that = this;

    // TODO: Address the case when `that.debuggee_` is `null`.
    that.controller_.updateBreakpoint(
        (that.debuggee_ as Debuggee), breakpoint, function(err /*, body*/) {
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
  scheduleBreakpointExpiry_(breakpoint: stackdriver.Breakpoint): void {
    const that = this;

    const now = Date.now() / 1000;
    const createdTime = breakpoint.createdTime ?
        parseInt(breakpoint.createdTime.seconds, 10) :
        now;
    const expiryTime = createdTime + that.config_.breakpointExpirationSec;

    setTimeout(function() {
      that.logger_.info('Expiring breakpoint ' + breakpoint.id);
      breakpoint.status = {
        description: {format: 'The snapshot has expired'},
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
  stop(): void {
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
  // TODO: Determine if this can be generic
  // TODO: The code that uses this actually assumes the supplied arguments
  //       are objects and used as an associative array.  Determine what is
  //       correct (the code or the docs).
  // TODO: Fix the docs because the code actually assumes that the values
  //       of the keys in the supplied arguments have boolean values or
  //       Breakpoint values.
  static mapSubtract<T, U>(A: {[key: string]: T}, B: {[key: string]: U}): T[] {
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
  static format(base: string, exprs: string[]): string {
    const tokens = Debuglet._tokenize(base, exprs.length);
    for (let i = 0; i < tokens.length; i++) {
      // TODO: Determine how to remove this explicit cast
      if (!(tokens[i] as {v: string}).v) {
        continue;
      }
      // TODO: Determine how to not have an explicit cast here
      if ((tokens[i] as {v: string}).v === '$$') {
        tokens[i] = '$';
        continue;
      }
      for (let j = 0; j < exprs.length; j++) {
        // TODO: Determine how to not have an explicit cast here
        if ((tokens[i] as {v: string}).v === '$' + j) {
          tokens[i] = exprs[j];
          break;
        }
      }
    }
    return tokens.join('');
  }

  static _tokenize(base: string, exprLength: number):
      Array<{v: string}|string> {
    let acc = Debuglet._delimit(base, '$$');
    for (let i = exprLength - 1; i >= 0; i--) {
      const newAcc = [];
      for (let j = 0; j < acc.length; j++) {
        // TODO: Determine how to remove this explicit cast
        if ((acc[j] as {v: string}).v) {
          newAcc.push(acc[j]);
        } else {
          // TODO: Determine how to not have an explicit cast to string here
          newAcc.push.apply(
              newAcc, Debuglet._delimit(acc[j] as string, '$' + i));
        }
      }
      acc = newAcc;
    }
    return acc;
  }

  static _delimit(source: string, delim: string): Array<{v: string}|string> {
    const pieces = source.split(delim);
    const dest = [];
    dest.push(pieces[0]);
    for (let i = 1; i < pieces.length; i++) {
      dest.push({v: delim}, pieces[i]);
    }
    return dest;
  }

  static _createUniquifier(
      desc: string, version: string, uid: string,
      sourceContext: {[key: string]: any},
      labels: {[key: string]: string}): string {
    const uniquifier = desc + version + uid + JSON.stringify(sourceContext) +
        JSON.stringify(labels);
    return crypto.createHash('sha1').update(uniquifier).digest('hex');
  }
}
