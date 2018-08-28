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

import * as assert from 'assert';
import * as consoleLogLevel from 'console-log-level';
import * as crypto from 'crypto';
import {EventEmitter} from 'events';
import * as extend from 'extend';
import * as fs from 'fs';
import * as metadata from 'gcp-metadata';
import * as _ from 'lodash';
import * as path from 'path';
import * as util from 'util';

import {Debug, PackageInfo} from '../client/stackdriver/debug';
import {StatusMessage} from '../client/stackdriver/status-message';
import {Debuggee, DebuggeeProperties} from '../debuggee';
import * as stackdriver from '../types/stackdriver';

import {defaultConfig} from './config';
import {DebugAgentConfig, Logger, LogLevel, ResolvedDebugAgentConfig} from './config';
import {Controller} from './controller';
import * as scanner from './io/scanner';
import * as SourceMapper from './io/sourcemapper';
import * as utils from './util/utils';
import * as debugapi from './v8/debugapi';
import {DebugApi} from './v8/debugapi';

const promisify = require('util.promisify');

const readFilep = promisify(fs.readFile);

const ALLOW_EXPRESSIONS_MESSAGE = 'Expressions and conditions are not allowed' +
    ' by default. Please set the allowExpressions configuration option to true.' +
    ' See the debug agent documentation at https://goo.gl/ShSm6r.';
const NODE_VERSION_MESSAGE =
    'Node.js version not supported. Node.js 5.2.0 and ' +
    ' versions older than 0.12 are not supported.';
const BREAKPOINT_ACTION_MESSAGE =
    'The only currently supported breakpoint actions' +
    ' are CAPTURE and LOG.';

// PROMISE_RESOLVE_CUT_OFF_IN_MILLISECONDS is a heuristic duration that we set
// to force the debug agent to return a new promise for isReady. The value is
// the average of Stackdriver debugger hanging get duration (40s) and TCP
// time-out on GCF (540s).
const PROMISE_RESOLVE_CUT_OFF_IN_MILLISECONDS = (40 + 540) / 2 * 1000;

interface SourceContext {
  [key: string]: string;
}

/**
 * Formats a breakpoint object prefixed with a provided message as a string
 * intended for logging.
 * @param {string} msg The message that prefixes the formatted breakpoint.
 * @param {Breakpoint} breakpoint The breakpoint to format.
 * @return {string} A formatted string.
 */
const formatBreakpoint =
    (msg: string, breakpoint: stackdriver.Breakpoint): string => {
      let text = msg +
          util.format(
              'breakpoint id: %s,\n\tlocation: %s', breakpoint.id,
              util.inspect(breakpoint.location));
      if (breakpoint.createdTime) {
        const unixTime = Number(breakpoint.createdTime.seconds);
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
const formatBreakpoints =
    (msg: string, breakpoints: {[key: string]: stackdriver.Breakpoint}):
        string => {
          return msg +
              Object.keys(breakpoints)
                  .map((b) => {
                    return formatBreakpoint('', breakpoints[b]);
                  })
                  .join('\n');
        };

/**
 * CachedPromise stores a promise. This promise can be resolved by calling
 * function resolve() and can only be resolved once.
 */
export class CachedPromise {
  private promiseResolve: (() => void)|null = null;
  private promise: Promise<void> = new Promise<void>((resolve) => {
    this.promiseResolve = resolve;
  });

  get(): Promise<void> {
    return this.promise;
  }

  resolve(): void {
    // Each promise can be resolved only once.
    if (this.promiseResolve) {
      this.promiseResolve();
      this.promiseResolve = null;
    }
  }
}

/**
 * IsReady will return a promise to user after user starting the debug agent.
 * This promise will be resolved when one of the following is true:
 * 1. Time since last listBreakpoint was within a heuristic time.
 * 2. listBreakpoint completed successfully.
 * 3. Debuggee registration expired or failed, listBreakpoint cannot be
 *    completed.
 */
export interface IsReady {
  isReady(): Promise<void>;
}

/**
 * IsReadyManager is a wrapper class to use debuglet.isReady().
 */
class IsReadyImpl implements IsReady {
  constructor(private debuglet: Debuglet) {}
  isReady(): Promise<void> {
    return this.debuglet.isReady();
  }
}

export interface FindFilesResult {
  jsStats: scanner.ScanStats;
  mapFiles: string[];
  errors: Map<string, Error>;
  hash?: string;
}

export class Debuglet extends EventEmitter {
  private debug: Debug;
  private v8debug: DebugApi|null;
  private running: boolean;
  private project: string|null;
  private controller: Controller;
  private completedBreakpointMap: {[key: string]: boolean};

  // breakpointFetchedTimestamp represents the last timestamp when
  // breakpointFetched was resolved, which means breakpoint update was
  // successful.
  private breakpointFetchedTimestamp: number;
  // breakpointFetched is a CachedPromise only to be resolved after breakpoint
  // fetch was successful. Its stored promise will be returned by isReady().
  private breakpointFetched: CachedPromise|null;
  // debuggeeRegistered is a CachedPromise only to be resolved after debuggee
  // registration was successful.
  private debuggeeRegistered: CachedPromise;

  isReadyManager: IsReady = new IsReadyImpl(this);

  // Exposed for testing
  config: ResolvedDebugAgentConfig;
  fetcherActive: boolean;
  logger: Logger;
  debuggee: Debuggee|null;
  activeBreakpointMap: {[key: string]: stackdriver.Breakpoint};

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
    this.config = Debuglet.normalizeConfig_(config);

    /** @private {Debug} */
    this.debug = debug;

    /**
     * @private {object} V8 Debug API. This can be null if the Node.js version
     *     is out of date.
     */
    this.v8debug = null;

    /** @private {boolean} */
    this.running = false;

    /** @private {string} */
    this.project = null;

    /** @private {boolean} */
    this.fetcherActive = false;

    /** @private */
    this.logger = consoleLogLevel({
      stderr: true,
      prefix: this.debug.packageInfo.name,
      level: Debuglet.logLevelToName(this.config.logLevel)
    });

    /** @private {DebugletApi} */
    this.controller = new Controller(this.debug, {apiUrl: config.apiUrl});

    /** @private {Debuggee} */
    this.debuggee = null;

    /** @private {Object.<string, Breakpoint>} */
    this.activeBreakpointMap = {};

    /** @private {Object.<string, Boolean>} */
    this.completedBreakpointMap = {};

    this.breakpointFetched = null;
    this.breakpointFetchedTimestamp = -Infinity;
    this.debuggeeRegistered = new CachedPromise();
  }

  static LEVELNAMES: LogLevel[] =
      ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
  // The return type `LogLevel` is used instead of
  // `consoleLogLevel.LogLevelNames` because, otherwise,
  // the `consoleLogLevel.LogLevelNames` type is exposed to
  // users of the debug agent, requiring them to have
  // @types/console-log-level installed to compile their code.
  static logLevelToName(level: number): LogLevel {
    if (typeof level === 'string') {
      level = Number(level);
    }
    if (typeof level !== 'number') {
      level = defaultConfig.logLevel;
    }
    if (level < 0) level = 0;
    if (level > 4) level = 4;
    return Debuglet.LEVELNAMES[level];
  }

  static normalizeConfig_(config: DebugAgentConfig): ResolvedDebugAgentConfig {
    const envConfig = {
      logLevel: process.env.GCLOUD_DEBUG_LOGLEVEL,
      serviceContext: {
        service: process.env.GAE_SERVICE || process.env.GAE_MODULE_NAME,
        version: process.env.GAE_VERSION || process.env.GAE_MODULE_VERSION,
        minorVersion_:
            process.env.GAE_DEPLOYMENT_ID || process.env.GAE_MINOR_VERSION
      }
    };

    if (process.env.FUNCTION_NAME) {
      envConfig.serviceContext.service = process.env.FUNCTION_NAME;
      envConfig.serviceContext.version = 'unversioned';
    }

    return extend(true, {}, defaultConfig, config, envConfig);
  }

  static async findFiles(shouldHash: boolean, baseDir: string):
      Promise<FindFilesResult> {
    const fileStats = await scanner.scan(shouldHash, baseDir, /.js$|.js.map$/);
    const jsStats = fileStats.selectStats(/.js$/);
    const mapFiles = fileStats.selectFiles(/.js.map$/, process.cwd());
    const errors = fileStats.errors();
    return {jsStats, mapFiles, errors, hash: fileStats.hash};
  }

  /**
   * Starts the Debuglet. It is important that this is as quick as possible
   * as it is on the critical path of application startup.
   * @private
   */
  async start(): Promise<void> {
    const that = this;
    const stat = promisify(fs.stat);

    try {
      await stat(path.join(that.config.workingDirectory, 'package.json'));
    } catch (err) {
      that.logger.error('No package.json located in working directory.');
      that.emit('initError', new Error('No package.json found.'));
      return;
    }

    const workingDir = that.config.workingDirectory;
    // Don't continue if the working directory is a root directory
    // unless the user wants to force using the root directory
    if (!that.config.allowRootAsWorkingDirectory &&
        path.join(workingDir, '..') === workingDir) {
      const message = 'The working directory is a root directory. Disabling ' +
          'to avoid a scan of the entire filesystem for JavaScript files. ' +
          'Use config \allowRootAsWorkingDirectory` if you really want to ' +
          'do this.';
      that.logger.error(message);
      that.emit('initError', new Error(message));
      return;
    }

    // TODO: Verify that it is fine for `id` to be undefined.
    let id: string|undefined;
    if (process.env.GAE_MINOR_VERSION) {
      id = 'GAE-' + process.env.GAE_MINOR_VERSION;
    }

    let findResults: FindFilesResult;
    try {
      findResults = await Debuglet.findFiles(!id, that.config.workingDirectory);
      findResults.errors.forEach(that.logger.warn);
    } catch (err) {
      that.logger.error('Error scanning the filesystem.', err);
      that.emit('initError', err);
      return;
    }

    let mapper;
    try {
      mapper = await SourceMapper.create(findResults.mapFiles);
    } catch (err3) {
      that.logger.error('Error processing the sourcemaps.', err3);
      that.emit('initError', err3);
      return;
    }
    that.v8debug =
        debugapi.create(that.logger, that.config, findResults.jsStats, mapper);

    id = id || findResults.hash;

    that.logger.info('Unique ID for this Application: ' + id);

    let onGCP: boolean;
    try {
      onGCP = await Debuglet.runningOnGCP();
    } catch (err) {
      that.logger.warn(
          'Unexpected error detecting GCE metadata service: ' + err.message);
      // Continue, assuming not on GCP.
      onGCP = false;
    }

    let project: string;
    try {
      project = await that.debug.authClient.getProjectId();
    } catch (err) {
      that.logger.error(
          'The project ID could not be determined: ' + err.message);
      that.emit('initError', err);
      return;
    }

    if (onGCP &&
        (!that.config.serviceContext || !that.config.serviceContext.service)) {
      // If on GCP, check if the clusterName instance attribute is availble.
      // Use this as the service context for better service identification on
      // GKE.
      try {
        const clusterName = await Debuglet.getClusterNameFromMetadata();
        that.config.serviceContext = {
          service: clusterName,
          version: 'unversioned',
          minorVersion_: undefined
        };
      } catch (err) {
        /* we are not running on GKE - Ignore error. */
      }
    }

    let sourceContext;
    try {
      sourceContext = that.config.sourceContext as {} as SourceContext ||
          await Debuglet.getSourceContextFromFile();
    } catch (err5) {
      that.logger.warn('Unable to discover source context', err5);
      // This is ignorable.
    }

    // TODO: This code can be removed now that we support only Node 6+.
    if (utils.satisfies(process.version, '5.2 || <4')) {
      // Using an unsupported version. We report an error
      // message about the Node.js version, but we keep on
      // running. The idea is that the user may miss the error
      // message on the console. This way we can report the
      // error when the user tries to set a breakpoint.
      that.logger.error(NODE_VERSION_MESSAGE);
    }

    // We can register as a debuggee now.
    that.logger.debug('Starting debuggee, project', project);
    that.running = true;

    // TODO: Address the case where `project` is `undefined`.
    that.project = project;
    that.debuggee = Debuglet.createDebuggee(
        // TODO: Address the case when `id` is `undefined`.
        project, id as string, that.config.serviceContext, sourceContext, onGCP,
        that.debug.packageInfo, that.config.description, undefined);
    that.scheduleRegistration_(0 /* immediately */);
    that.emit('started');
  }

  /**
   * isReady returns a promise that only resolved if the last breakpoint update
   * happend within a duration (PROMISE_RESOLVE_CUT_OFF_IN_MILLISECONDS). This
   * feature is mainly used in Google Cloud Function (GCF), as it is a
   * serverless environment and we wanted to make sure debug agent always
   * captures the snapshots.
   */
  isReady(): Promise<void> {
    if (Date.now() < this.breakpointFetchedTimestamp +
            PROMISE_RESOLVE_CUT_OFF_IN_MILLISECONDS) {
      return Promise.resolve();
    } else {
      if (this.breakpointFetched) return this.breakpointFetched.get();
      this.breakpointFetched = new CachedPromise();
      this.debuggeeRegistered.get().then(() => {
        this.scheduleBreakpointFetch_(
            0 /*immediately*/, true /*only fetch once*/);
      });
      return this.breakpointFetched.get();
    }
  }

  /**
   * @private
   */
  // TODO: Determine the type of sourceContext
  static createDebuggee(
      projectId: string, uid: string,
      serviceContext:
          {service?: string, version?: string, minorVersion_?: string},
      sourceContext: SourceContext|undefined, onGCP: boolean,
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

    const properties: DebuggeeProperties = {
      project: projectId,
      uniquifier,
      description: desc,
      agentVersion: version,
      labels,
      statusMessage,
      packageInfo
    };
    if (sourceContext) {
      properties.sourceContexts = [sourceContext];
    }
    return new Debuggee(properties);
  }

  static runningOnGCP(): Promise<boolean> {
    return metadata.isAvailable();
  }

  static async getClusterNameFromMetadata(): Promise<string> {
    return (await metadata.instance('attributes/cluster-name')).data as string;
  }

  static async getSourceContextFromFile(): Promise<SourceContext> {
    // If read errors, the error gets thrown to the caller.
    const contents = await readFilep('source-context.json', 'utf8');
    try {
      return JSON.parse(contents);
    } catch (e) {
      throw new Error('Malformed source-context.json file: ' + e);
    }
  }

  /**
   * @param {number} seconds
   * @private
   */
  scheduleRegistration_(seconds: number): void {
    const that = this;

    function onError(err: Error) {
      that.logger.error(
          'Failed to re-register debuggee ' + that.project + ': ' + err);
      that.scheduleRegistration_(Math.min(
          (seconds + 1) * 2, that.config.internal.maxRegistrationRetryDelay));
    }

    setTimeout(() => {
      if (!that.running) {
        onError(new Error('Debuglet not running'));
        return;
      }

      // TODO: Handle the case when `that.debuggee` is null.
      that.controller.register(
          that.debuggee as Debuggee,
          (err: Error|null, result?: {debuggee: Debuggee;}) => {
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
            that.logger.info(
                'Registered as debuggee:',
                (result as {debuggee: Debuggee}).debuggee.id);
            // TODO: Handle the case when `that.debuggee` is null.
            // TODO: Handle the case when `result` is undefined.
            (that.debuggee as Debuggee).id =
                (result as {debuggee: Debuggee}).debuggee.id;
            // TODO: Handle the case when `result` is undefined.
            that.emit(
                'registered', (result as {debuggee: Debuggee}).debuggee.id);
            that.debuggeeRegistered.resolve();
            if (!that.fetcherActive) {
              that.scheduleBreakpointFetch_(0, false);
            }
          });
    }, seconds * 1000).unref();
  }

  /**
   * @param {number} seconds
   * @param {boolean} once
   * @private
   */
  scheduleBreakpointFetch_(seconds: number, once: boolean): void {
    const that = this;
    if (!once) {
      that.fetcherActive = true;
    }
    setTimeout(() => {
      if (!that.running) {
        return;
      }

      if (!once) {
        assert(that.fetcherActive);
      }

      that.logger.info('Fetching breakpoints');
      // TODO: Address the case when `that.debuggee` is `null`.
      that.controller.listBreakpoints(
          (that.debuggee as Debuggee), (err, response, body) => {
            if (err) {
              that.logger.error(
                  'Unable to fetch breakpoints – stopping fetcher', err);
              that.fetcherActive = false;
              // We back-off from fetching breakpoints, and try to register
              // again after a while. Successful registration will restart the
              // breakpoint fetcher.
              that.updatePromise();
              that.scheduleRegistration_(
                  that.config.internal.registerDelayOnFetcherErrorSec);
              return;
            }
            // TODO: Address the case where `response` is `undefined`.
            switch (response!.statusCode) {
              case 404:
                // Registration expired. Deactivate the fetcher and queue
                // re-registration, which will re-active breakpoint fetching.
                that.logger.info('\t404 Registration expired.');
                that.fetcherActive = false;
                that.updatePromise();
                that.scheduleRegistration_(0 /*immediately*/);
                return;

              default:
                // TODO: Address the case where `response` is `undefined`.
                that.logger.info('\t' + response!.statusCode + ' completed.');
                if (!body) {
                  that.logger.error('\tinvalid list response: empty body');
                  that.scheduleBreakpointFetch_(
                      that.config.breakpointUpdateIntervalSec, once);
                  return;
                }
                if (body.waitExpired) {
                  that.logger.info('\tLong poll completed.');
                  that.scheduleBreakpointFetch_(0 /*immediately*/, once);
                  return;
                }
                const bps = (body.breakpoints ||
                             []).filter((bp: stackdriver.Breakpoint) => {
                  const action = bp.action || 'CAPTURE';
                  if (action !== 'CAPTURE' && action !== 'LOG') {
                    that.logger.warn(
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
                if (Object.keys(that.activeBreakpointMap).length) {
                  that.logger.info(formatBreakpoints(
                      'Active Breakpoints: ', that.activeBreakpointMap));
                }
                that.breakpointFetchedTimestamp = Date.now();
                if (once) {
                  if (that.breakpointFetched) {
                    that.breakpointFetched.resolve();
                    that.breakpointFetched = null;
                  }
                } else {
                  that.scheduleBreakpointFetch_(
                      that.config.breakpointUpdateIntervalSec, once);
                }
                return;
            }
          });
    }, seconds * 1000).unref();
  }

  /**
   * updatePromise_ is called when debuggee is expired. debuggeeRegistered
   * CachedPromise will be refreshed. Also, breakpointFetched CachedPromise will
   * be resolved so that uses (such as GCF users) will not hang forever to wait
   * non-fetchable breakpoints.
   */
  private updatePromise() {
    this.debuggeeRegistered = new CachedPromise();
    if (this.breakpointFetched) {
      this.breakpointFetched.resolve();
      this.breakpointFetched = null;
    }
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
      that.logger.info(
          formatBreakpoints('Server breakpoints: ', updatedBreakpointMap));
    }
    breakpoints.forEach((breakpoint: stackdriver.Breakpoint) => {
      // TODO: Address the case when `breakpoint.id` is `undefined`.
      if (!that.completedBreakpointMap[breakpoint.id as string] &&
          !that.activeBreakpointMap[breakpoint.id as string]) {
        // New breakpoint
        that.addBreakpoint_(breakpoint, (err) => {
          if (err) {
            that.completeBreakpoint_(breakpoint);
          }
        });

        // Schedule the expiry of server breakpoints.
        that.scheduleBreakpointExpiry_(breakpoint);
      }
    });

    // Remove completed breakpoints that the server no longer cares about.
    Debuglet.mapSubtract(this.completedBreakpointMap, updatedBreakpointMap)
        .forEach((breakpoint) => {
          // TODO: FIXME: breakpoint is a boolean here that doesn't have an id
          //              field.  It is possible that breakpoint.id is always
          //              undefined!
          // TODO: Make sure the use of `that` here is correct.
          delete that
              .completedBreakpointMap[(breakpoint as {} as {id: number}).id];
        });

    // Remove active breakpoints that the server no longer care about.
    Debuglet.mapSubtract(this.activeBreakpointMap, updatedBreakpointMap)
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
    breakpointList.forEach((breakpoint) => {
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
    this.logger.info('\tdeleted breakpoint', breakpoint.id);
    // TODO: Address the case when `breakpoint.id` is `undefined`.
    delete this.activeBreakpointMap[breakpoint.id as string];
    if (this.v8debug) {
      this.v8debug.clear(breakpoint, (err) => {
        if (err) this.logger.error(err);
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

    if (!that.config.allowExpressions &&
        (breakpoint.condition || breakpoint.expressions)) {
      that.logger.error(ALLOW_EXPRESSIONS_MESSAGE);
      breakpoint.status = new StatusMessage(
          StatusMessage.UNSPECIFIED, ALLOW_EXPRESSIONS_MESSAGE, true);
      setImmediate(() => {
        cb(ALLOW_EXPRESSIONS_MESSAGE);
      });
      return;
    }

    if (utils.satisfies(process.version, '5.2 || <4')) {
      const message = NODE_VERSION_MESSAGE;
      that.logger.error(message);
      breakpoint.status =
          new StatusMessage(StatusMessage.UNSPECIFIED, message, true);
      setImmediate(() => {
        cb(message);
      });
      return;
    }

    // TODO: Address the case when `that.v8debug` is `null`.
    (that.v8debug as DebugApi).set(breakpoint, (err1) => {
      if (err1) {
        cb(err1);
        return;
      }

      that.logger.info('\tsuccessfully added breakpoint  ' + breakpoint.id);
      // TODO: Address the case when `breakpoint.id` is `undefined`.
      that.activeBreakpointMap[breakpoint.id as string] = breakpoint;

      if (breakpoint.action === 'LOG') {
        // TODO: Address the case when `that.v8debug` is `null`.
        (that.v8debug as DebugApi)
            .log(
                breakpoint,
                (fmt: string, exprs: string[]) => {
                  console.log('LOGPOINT:', Debuglet.format(fmt, exprs));
                },
                () => {
                  // TODO: Address the case when `breakpoint.id` is `undefined`.
                  return that.completedBreakpointMap[breakpoint.id as string];
                });
      } else {
        // TODO: Address the case when `that.v8debug` is `null`.
        (that.v8debug as DebugApi).wait(breakpoint, (err2) => {
          if (err2) {
            that.logger.error(err2);
            cb(err2);
            return;
          }

          that.logger.info('Breakpoint hit!: ' + breakpoint.id);
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

    that.logger.info('\tupdating breakpoint data on server', breakpoint.id);
    that.controller.updateBreakpoint(
        // TODO: Address the case when `that.debuggee` is `null`.
        (that.debuggee as Debuggee), breakpoint, (err /*, body*/) => {
          if (err) {
            that.logger.error('Unable to complete breakpoint on server', err);
          } else {
            // TODO: Address the case when `breakpoint.id` is `undefined`.
            that.completedBreakpointMap[breakpoint.id as string] = true;
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

    // TODO: Address the case when `that.debuggee` is `null`.
    that.controller.updateBreakpoint(
        (that.debuggee as Debuggee), breakpoint, (err /*, body*/) => {
          if (err) {
            that.logger.error('Unable to complete breakpoint on server', err);
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
    const createdTime =
        breakpoint.createdTime ? Number(breakpoint.createdTime.seconds) : now;
    const expiryTime = createdTime + that.config.breakpointExpirationSec;

    setTimeout(() => {
      that.logger.info('Expiring breakpoint ' + breakpoint.id);
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
    assert.ok(this.running, 'stop can only be called on a running agent');
    this.logger.debug('Stopping Debuglet');
    this.running = false;
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
    for (const key in A) {
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
      sourceContext: SourceContext|undefined,
      labels: {[key: string]: string}): string {
    const uniquifier = desc + version + uid + JSON.stringify(sourceContext) +
        JSON.stringify(labels);
    return crypto.createHash('sha1').update(uniquifier).digest('hex');
  }
}
