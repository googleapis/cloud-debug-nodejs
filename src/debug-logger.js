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

var common = require('@google-cloud/common');
var util = require('util');

/**
 * Formats a breakpoint object prefixed with a provided message as a string
 * intended for logging.
 * @param {string} msg The message that prefixes the formatted breakpoint.
 * @param {Breakpoint} breakpoint The breakpoint to format.
 * @return {string} A formatted string.
 */
var formatBreakpoint = function(msg, breakpoint) {
  var text = msg + util.format('breakpoint id: %s,\n\tlocation: %s',
    breakpoint.id, util.inspect(breakpoint.location));
  if (breakpoint.createdTime) {
    var unixTime = parseInt(breakpoint.createdTime.seconds, 10);
    var date = new Date(unixTime * 1000); // to milliseconds.
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
 * Formats a provided message and a high-resolution interval of the format
 * [seconds, nanoseconds] (for example, from process.hrtime()) prefixed with a
 * provided message as a string intended for logging.
 * @param {string} msg The mesage that prefixes the formatted interval.
 * @param {number[]} interval The interval to format.
 * @return {string} A formatted string.
 */
var formatInterval = function(msg, interval) {
  return msg + ' ' + (interval[0] * 1000 + interval[1] / 1000000) + 'ms';
};

module.exports = function(options) {
  var newLogger = common.logger(options);

  common.logger.LEVELS.forEach(function(logLevel) {
    newLogger[logLevel].breakpoint = function(msg, breakpoint) {
      return newLogger[logLevel](formatBreakpoint(msg, breakpoint));
    };
    newLogger[logLevel].interval = function(msg, interval) {
      return newLogger[logLevel](formatInterval(msg, interval));
    };
  });

  return newLogger;
};
