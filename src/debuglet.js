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

'use strict';

var fs = require('fs');
var path = require('path');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var semver = require('semver');

var v8debugapi = require('./v8debugapi.js');
var DebugletApi = require('./debugletapi.js');
var scanner = require('./scanner.js');
var Logger = require('@google/cloud-diagnostics-common').logger;
var StatusMessage = require('./apiclasses.js').StatusMessage;
var SourceMapper = require('./sourcemapper.js');

var assert = require('assert');

var NODE_VERSION_MESSAGE = 'Node.js version not supported. Node.js 5.2.0 and ' +
  ' versions older than 0.12 are not supported.';
var BREAKPOINT_ACTION_MESSAGE = 'The only currently supported breakpoint actions' +
  ' are CAPTURE and LOG.';

module.exports = Debuglet;

/**
 * @param {Object} config The option parameters for the Debuglet.
 * @event 'error' on startup errors
 * @event 'started' once the startup tasks are completed
 * @event 'registered' once successfully registered to the debug api
 * @event 'stopped' if the agent stops due to a fatal error after starting
 * @constructor
 */
function Debuglet(config, logger) {
  /** @private {object} */
  this.config_ = config || {};

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

  /** @private {Logger} */
  this.logger_ = logger;

  /** @private {DebugletApi} */
  this.debugletApi_ = new DebugletApi(config);

  /** @private {Object.<string, Breakpoint>} */
  this.activeBreakpointMap_ = {};

  /** @private {Object.<string, Boolean>} */
  this.completedBreakpointMap_ = {};

  EventEmitter.call(this);
}

util.inherits(Debuglet, EventEmitter);

/**
 * Starts the Debuglet. It is important that this is as quick as possible
 * as it is on the critical path of application startup.
 * @private
 */
Debuglet.prototype.start = function() {
  var that = this;
  fs.stat(path.join(that.config_.workingDirectory, 'package.json'), function(err) {
    if (err && err.code === 'ENOENT') {
      that.logger_.error('No package.json located in working directory.');
      that.emit('initError', new Error('No package.json found.'));
      return;
    }
    var id;
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

      var jsStats = fileStats.selectStats(/.js$/);
      var mapFiles = fileStats.selectFiles(/.map$/, process.cwd());
      SourceMapper.create(mapFiles, function(err, mapper) {
        if (err) {
          that.logger_.error('Error processing the sourcemaps.', err);
          that.emit('initError', err);
          return;
        }
        
        that.v8debug_ = v8debugapi.create(that.logger_, that.config_, jsStats, mapper);

        id = id || hash;

        that.logger_.info('Unique ID for this Application: ' + id);

        that.debugletApi_.init(id, that.logger_, function(err, project) {
          if (err) {
            that.logger_.error('Unable to initialize the debuglet api' +
              ' -- disabling debuglet', err);
            that.emit('initError', err);
            return;
          }

          if (semver.satisfies(process.version, '5.2 || <0.12')) {
            // Using an unsupported version. We report an error message about the
            // Node.js version, but we keep on running. The idea is that the user
            // may miss the error message on the console. This way we can report the
            // error when the user tries to set a breakpoint.
            that.logger_.error(NODE_VERSION_MESSAGE);
          }

          // We can register as a debuggee now.
          that.running_ = true;
          that.project_ = project;
          that.scheduleRegistration_(0 /* immediately */);
          that.emit('started');
        });
      });
    });
  });
};

/**
 * @param {number} seconds
 * @private
 */
Debuglet.prototype.scheduleRegistration_ = function(seconds) {
  var that = this;

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

    that.debugletApi_.register(function(err, result) {
      if (err) {
        onError(err);
        return;
      }

      if (result.debuggee.isDisabled) {
        // Server has disabled this debuggee / debug agent.
        onError(new Error('Disabled by the server'));
        return;
      }

      that.logger_.info('Registered as debuggee:', result.debuggee.id);

      that.emit('registered', result.debuggee.id);
      if (!that.fetcherActive_) {
        that.scheduleBreakpointFetch_(0);
      }
    });
  }, seconds * 1000).unref();
};

/**
 * @param {number} seconds
 * @private
 */
Debuglet.prototype.scheduleBreakpointFetch_ = function(seconds) {
  var that = this;

  that.fetcherActive_ = true;
  setTimeout(function() {
    if (!that.running_) {
      return;
    }
    assert(that.fetcherActive_);

    that.logger_.info('Fetching breakpoints');
    that.debugletApi_.listBreakpoints(function(err, response, body) {
      if (err) {
        that.logger_.error('Unable to fetch breakpoints – stopping fetcher',
          err);
        that.fetcherActive_ = false;
        // We back-off from fetching breakpoints, and try to register again after
        // a while. Successful registration will restart the breakpoint fetcher.
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
          var bps = (body.breakpoints || []).filter(function(bp) {
            var action = bp.action || 'CAPTURE';
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
            that.logger_.breakpoints(Logger.INFO, 'Active Breakpoints:',
              that.activeBreakpointMap_);
          }
          that.scheduleBreakpointFetch_(that.config_.breakpointUpdateIntervalSec);
          return;
      }
    });
  }, seconds * 1000).unref();
};

/**
 * Given a list of server breakpoints, update our internal list of breakpoints
 * @param {Array.<Breakpoint>} breakpoints
 * @private
 */
Debuglet.prototype.updateActiveBreakpoints_ = function(breakpoints) {
  var that = this;
  var updatedBreakpointMap = this.convertBreakpointListToMap_(breakpoints);

  if (breakpoints.length) {
    that.logger_.breakpoints(Logger.INFO, 'Server breakpoints:', updatedBreakpointMap);
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
};

/**
 * Array of breakpints get converted to Map of breakpoints, indexed by id
 * @param {Array.<Breakpoint>} breakpointList
 * @return {Object.<string, Breakpoint>} A map of breakpoint IDs to breakpoints.
 * @private
 */
Debuglet.prototype.convertBreakpointListToMap_ = function(breakpointList) {
  var map = {};
  breakpointList.forEach(function(breakpoint) {
    map[breakpoint.id] = breakpoint;
  });
  return map;
};

/**
 * @param {Breakpoint} breakpoint
 * @private
 */
Debuglet.prototype.removeBreakpoint_ = function(breakpoint) {
  this.logger_.info('\tdeleted breakpoint', breakpoint.id);
  delete this.activeBreakpointMap_[breakpoint.id];
  if (this.v8debug_) {
    this.v8debug_.clear(breakpoint);
  }
};

/**
 * @param {Breakpoint} breakpoint
 * @return {boolean} false on error
 * @private
 */
Debuglet.prototype.addBreakpoint_ = function(breakpoint, cb) {
  var that = this;

  if (semver.satisfies(process.version, '5.2 || <0.12')) {
    var message = NODE_VERSION_MESSAGE;
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
};

/**
 * Update the server that the breakpoint has been completed (captured, or
 * expired).
 * @param {Breakpoint} breakpoint
 * @private
 */
Debuglet.prototype.completeBreakpoint_ = function(breakpoint) {
  var that = this;

  that.logger_.info('\tupdating breakpoint data on server', breakpoint.id);
  that.debugletApi_.updateBreakpoint(breakpoint, function(err/*, body*/) {
    if (err) {
      that.logger_.error('Unable to complete breakpoint on server', err);
    } else {
      that.completedBreakpointMap_[breakpoint.id] = true;
      that.removeBreakpoint_(breakpoint);
    }
  });
};

/**
 * Update the server that the breakpoint cannot be handled.
 * @param {Breakpoint} breakpoint
 * @private
 */
Debuglet.prototype.rejectBreakpoint_ = function(breakpoint) {
  var that = this;

  that.debugletApi_.updateBreakpoint(breakpoint, function(err/*, body*/) {
    if (err) {
      that.logger_.error('Unable to complete breakpoint on server', err);
    }
  });
};

/**
 * This schedules a delayed operation that will delete the breakpoint from the
 * server after the expiry period.
 * FIXME: we should cancel the timer when the breakpoint completes. Otherwise
 * we hold onto the closure memory until the breapointExpirateion timeout.
 * @param {Breakpoint} breakpoint Server breakpoint object
 * @private
 */
Debuglet.prototype.scheduleBreakpointExpiry_ = function(breakpoint) {
  var that = this;

  var now = Date.now() / 1000;
  var createdTime = breakpoint.createdTime ?
    parseInt(breakpoint.createdTime.seconds) : now;
  var expiryTime = createdTime + that.config_.breakpointExpirationSec;

  setTimeout(function() {
    that.logger_.info('Expiring breakpoint ' + breakpoint.id);
    breakpoint.status = {
      description: {
        format: 'The snapshot has expired'
      },
      isError: true,
      refersTo: 'unspecified'
    };
    that.completeBreakpoint_(breakpoint);
  }, (expiryTime - now) * 1000).unref();
};

/**
 * Stops the Debuglet
 */
Debuglet.prototype.stop = function() {
  this.running_ = false;
  this.emit('stopped');
};


/**
 * Performs a set subtract. Returns A - B given maps A, B.
 * @return {Array.<Breakpoint>} A array containing elements from A that are not
 *     in B.
 */
Debuglet.mapSubtract = function mapSubtract(A, B) {
  var removed = [];
  for (var key in A) {
    if (!B[key]) {
      removed.push(A[key]);
    }
  }
  return removed;
};

/**
 * Formats the message base with placeholders `$0`, `$1`, etc
 * by substituting the provided expressions. If more expressions
 * are given than placeholders extra expressions are dropped.
 */
Debuglet.format = function(base, exprs) {
  var tokens = Debuglet._tokenize(base, exprs.length);
  for (var i = 0; i < tokens.length; i++) {
    if (!tokens[i].v) {
      continue;
    }
    if (tokens[i].v === '$$') {
      tokens[i] = '$';
      continue;
    }
    for (var j = 0; j < exprs.length; j++) {
      if (tokens[i].v === '$' + j) {
        tokens[i] = exprs[j];
        break;
      }
    }
  }
  return tokens.join('');
};

Debuglet._tokenize = function(base, exprLength) {
  var acc = Debuglet._delimit(base, '$$');
  for (var i = exprLength - 1; i >= 0; i--) {
    var newAcc = [];
    for (var j = 0; j < acc.length; j++) {
      if (acc[j].v) {
        newAcc.push(acc[j]);
      } else {
        newAcc.push.apply(newAcc, Debuglet._delimit(acc[j], '$' + i));
      }
    }
    acc = newAcc;
  }
  return acc;
};

Debuglet._delimit = function(source, delim) {
  var pieces = source.split(delim);
  var dest = [];
  dest.push(pieces[0]);
  for (var i = 1; i < pieces.length; i++) {
    dest.push({ v: delim }, pieces[i]);
  }
  return dest;
};
