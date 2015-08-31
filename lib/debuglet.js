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

var v8debugapi = require('./v8debugapi.js');
var DebugletApi = require('./debugletapi.js');
var uid = require('./uid.js');
var Logger = require('@google/cloud-diagnostics-common').logger;
var StatusMessage = require('./apiclasses.js').StatusMessage;

var assert = require('assert');

var NODE_VERSION_MESSAGE = 'V8 Debug API not available – make sure you are ' +
    'running Node.js >=0.12. Cloud Debugger agent will not be able to take ' +
    'snapshots.';

module.exports = {
  start: function(config, logger, exports) {
    var agent = new Debuglet(config, logger);
    agent.start(function(err) {
      // For e2e testing.
      if (!err) {
        exports.debug.api_ = agent.debugletApi_;
      }
    });

    exports.debug = {/* nothing yet */};
  }
};

/**
 * @param {Object} config The option parameters for the Debuglet.
 * @constructor
 */
function Debuglet(config, logger) {
  /** @private {object} */
  this.config_ = config || {};

  /**
   * @private {object} V8 Debug API. This can be null if the Node.js version
   *     is out of date.
   */
  this.v8debug_ = v8debugapi.create(logger, config);

  /** @private {boolean} */
  this.running_ = false;

  /** @private {boolean} */
  this.fetcherActive_ = false;

  /** @private {Logger} */
  this.logger_ = logger;

  /** @private {DebugletApi} */
  this.debugletApi_ = new DebugletApi();

  /** @private {Object.<string, Breakpoint>} */
  this.activeBreakpointMap_ = {};

  /** @private {Object.<string, Breakpoint>} */
  this.completedBreakpointMap_ = {};
}

/**
 * Starts the Debuglet. It is important that this is as quick as possible
 * as it is on the critical path of application startup.
 * @param {function(?Error)=} opt_callback
 * @private
 */
Debuglet.prototype.start = function(opt_callback) {
  var that = this;

  uid.get(that.config_.workingDirectory, function(err, uid) {
    if (err) {
      that.logger_.error('Unable to compute unique id of the application', err);
      if (opt_callback) {
        opt_callback(err);
      }
      return;
    }
    that.logger_.info('Unique ID for this Application: ' + uid);

    that.debugletApi_.init(uid, function(err) {
      if (err) {
        that.logger_.error('Unable to initialize the debuglet api' +
          ' -- disabling debuglet', err);
        if (opt_callback) {
          opt_callback(err);
        }
        return;
      }

      if (!that.v8debug_) {
        // V8 Debug API is missing. We report an error message about the Node.js
        // version, but we keep on running. The idea is that the user may miss
        // the error message on the console. This way we can report the error
        // when the user tries to set a breakpoint.
        that.logger_.error(NODE_VERSION_MESSAGE);
      }

      // We can register as a debuggee now.
      that.running_ = true;
      that.scheduleRegistration_(0 /* immediately */);

      if (opt_callback) {
        opt_callback(null);
      }
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
    that.logger_.error('Failed to re-register debuggee: ' + err);
    that.logger_.error('Disabling gcloud debuglet');
    that.stop(); // fatal error
    // TODO: unless this is a configuration/fatal problem, maybe we should try
    // again after a larger delay?
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

        case 409: // Timeout on a hanging GET.
          that.logger_.info('\t409 Hanging GET completed, no change.');
          that.scheduleBreakpointFetch_(0/*immediately*/);
          return;

        default:
          that.logger_.info('\t' + response.statusCode + ' completed.');
          if (body.breakpoints) {
            that.updateActiveBreakpoints_(body.breakpoints || []);
          }
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
  that.logger_.breakpoints(Logger.INFO, 'Server breakpoints:', updatedBreakpointMap);

  breakpoints.forEach(function(breakpoint) {

    if (!that.completedBreakpointMap_[breakpoint.id] &&
        !that.activeBreakpointMap_[breakpoint.id]) {

      // New breakpoint
      that.addBreakpoint_(breakpoint, function(err) {
        if (err) {
          that.completeBreakpoint_(breakpoint);
        }
      });
    }

    // Schedule the expiry of server breakpoints.
    that.scheduleBreakpointExpiry_(breakpoint);
  });

  // Remove completed breakpoints that the server no longer cares about.
  mapSubtract(this.completedBreakpointMap_, updatedBreakpointMap)
    .forEach(function(breakpoint){
      delete this.completedBreakpointMap_[breakpoint.id];
    }, this);

  // Remove active breakpoints that the server no longer care about.
  mapSubtract(this.activeBreakpointMap_, updatedBreakpointMap)
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
  var message;

  if (!that.v8debug_) {
    message = NODE_VERSION_MESSAGE;
    that.logger_.error(message);
    breakpoint.status = new StatusMessage(StatusMessage.UNSPECIFIED,
      message, true);
    setImmediate(function() { cb(message); });
    return;
  }


  that.v8debug_.set(breakpoint, function(err) {
    if (err) {
      cb(message);
      return;
    }

    that.logger_.info('\tsuccessfully added breakpoint  ' + breakpoint.id);
    that.activeBreakpointMap_[breakpoint.id] = breakpoint;

    that.v8debug_.wait(breakpoint, function(err) {
      if (err) {
        that.logger_.error(err);
        cb(err);
        return;
      }

      that.logger_.info('Breakpoint hit!: ' + breakpoint.id);
      that.completeBreakpoint_(breakpoint);
    });
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

  that.logger_.breakpoint(Logger.INFO,
    'Updating breakpoint data on server', breakpoint);
  // TODO: in case of transient errors, retry the update operation
  // Put in the completed breakpoints map only when the update successfully
  // completes. Otherwise - we refuse to set the breakpoint, but the server
  // has never seen the update.
  that.debugletApi_.updateBreakpoint(breakpoint, function(err/*, body*/) {
    if (err) {
      that.logger_.error('Unable to complete breakpoint on server', err);
    }
  });
  // TODO(ofrobots): breakpoint may be holding on to a lot of data. We only
  // need to remember the breakpoint id.
  that.completedBreakpointMap_[breakpoint.id] = breakpoint;
  that.removeBreakpoint_(breakpoint);
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
};


/**
 * Performs a set subtract. Returns A - B given maps A, B.
 * TODO(ofrobots): we need unit tests for this
 * @return {Array.<Breakpoint>} A array containing elements from A that are not
 *     in B.
 */
function mapSubtract(A, B) {
  var removed = [];
  for (var key in A) {
    if (!B[key]) {
      removed.push(A[key]);
    }
  }
  return removed;
}

