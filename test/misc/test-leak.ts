'use strict';

const v8debugapi = require('../src/v8debugapi.js');
const config = require('../config.js').default;
import * as assert from 'assert';
import * as util from 'util';

// tslint:disable:variable-name
const Logger = require('../src/logger.js');
const logger = new Logger(config.logLevel);

assert.ok(v8debugapi.init(logger, config));

let iters = 0;

function test() {
  iters++;

  const bp = {id: 'fake-breakpoint', location: {path: __filename, line: 4}};
  v8debugapi.set(bp);
  v8debugapi.clear(bp);

  if (iters % 100 === 0) {
    console.log(iters + ' ' + util.inspect(process.memoryUsage()));
  }

  // infinite loop
  setImmediate(test);
}

test();
