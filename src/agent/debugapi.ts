import * as acorn from 'acorn'
import * as estree from 'estree'
import * as path from 'path';
import * as _ from 'lodash';
import * as vm from 'vm'
import * as semver from 'semver';

import * as apiTypes from '../types/api-types';
import {StatusMessage} from '../status-message';
import {MapInfoOutput, SourceMapper} from './sourcemapper';
import * as v8Types from '../types/v8-types';
import {Logger} from '../types/common-types';

import * as v8breakpoint from './v8breakpoint';
import {DebugAgentConfig} from './config';
import {FileStats, ScanStats} from './scanner';



export interface DebugApi {
  sourcemapper: SourceMapper;
  set: (breakpoint: apiTypes.Breakpoint, cb: (err: Error|null) => void) => void;
  numBreakpoints_: () => number;
  numListeners_: () => number;
}

export class V8DebugApi implements DebugApi {
  breakpoints: {[id: string]: v8breakpoint.V8BreakpointData} = {};
  sourcemapper: SourceMapper;
  v8: v8Types.Debug;
  config: DebugAgentConfig;
  fileStats: ScanStats;
  listeners: {[id: string]:
       {enabled: boolean; listener: (...args: any[]) => any;}} = {};
  v8Version: any;
  usePermanentListener: boolean;
  logger: Logger;

  numBreakpoints = 0;

  constructor(logger_: Logger, sourcemapper_: SourceMapper, config_: DebugAgentConfig,
    jsFiles_: ScanStats) {
  this.sourcemapper = sourcemapper_;
  this.v8 = vm.runInDebugContext('Debug');
  this.config = config_;
  this.fileStats = jsFiles_;
  this.v8Version = /(\d+\.\d+\.\d+)\.\d+/.exec(process.versions.v8);
  this.logger = logger_;
  this.usePermanentListener = semver.satisfies(this.v8Version[1], '>=4.5');
}

  set(breakpoint: apiTypes.Breakpoint, cb: (err: Error|null) => void) {
    if (!this.v8 || !breakpoint ||
      typeof breakpoint.id === 'undefined' ||  // 0 is a valid id
      !breakpoint.location || !breakpoint.location.path ||
      !breakpoint.location.line) {

      return setErrorStatusAndCallback(
          cb, breakpoint, StatusMessage.UNSPECIFIED,
          messages.INVALID_BREAKPOINT);
    }
    const baseScriptPath = path.normalize(breakpoint.location.path);
    if (!this.sourcemapper.hasMappingInfo(baseScriptPath)) {
      if (!_.endsWith(baseScriptPath, '.js')) {
        return setErrorStatusAndCallback(
            cb, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
            messages.COULD_NOT_FIND_OUTPUT_FILE);
      }
      this.setInternal(breakpoint, null /* mapInfo */, null /* compile */, cb);
    } else {

    }

  }

  numBreakpoints_(): number {
    return Object.keys(this.breakpoints).length;
  }

  numListeners_(): number {
    return Object.keys(this.listeners).length;
  }

  setInternal(
    breakpoint: apiTypes.Breakpoint, mapInfo: MapInfoOutput|null,
    compile: ((src: string) => string)|null,
    cb: (err: Error|null) => void): void {
// Parse and validate conditions and watch expressions for correctness and
    // immutability
    let ast = null;
    if (breakpoint.condition) {
      try {
        // We parse as ES6; even though the underlying V8 version may only
        // support a subset. This should be fine as the objective of the parse
        // is to heuristically find side-effects. V8 will raise errors later
        // if the syntax is invalid. It would have been nice if V8 had made the
        // parser API available us :(.
        ast = acorn.parse(
            breakpoint.condition, {sourceType: 'script', ecmaVersion: 6});
        const validator = require('./validator.js');
        if (!validator.isValid(ast)) {
          return setErrorStatusAndCallback(
              cb, breakpoint, StatusMessage.BREAKPOINT_CONDITION,
              messages.DISALLOWED_EXPRESSION);
        }
      } catch (err) {
        const message = messages.SYNTAX_ERROR_IN_CONDITION + err.message;
        return setErrorStatusAndCallback(
            cb, breakpoint, StatusMessage.BREAKPOINT_CONDITION, message);
      }
    }

    // Presently it is not possible to precisely disambiguate the script
    // path from the path provided by the debug server. The issue is that we
    // don't know the repository root relative to the root filesystem or
    // relative to the working-directory of the process. We want to make sure
    // that we are setting the breakpoint that the user intended instead of a
    // breakpoint in a file that happens to have the same name but is in a
    // different directory. Until this is addressed between the server and the
    // debuglet, we are going to assume that repository root === the starting
    // working directory.
    let matchingScript;
    // TODO: Address the case where `breakpoint.location` is `null`.
    const scripts = findScripts(
        mapInfo ? mapInfo.file :
                  path.normalize(
                      (breakpoint.location as apiTypes.SourceLocation).path),
        this.config, this.fileStats);
    if (scripts.length === 0) {
      return setErrorStatusAndCallback(
          cb, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
          messages.SOURCE_FILE_NOT_FOUND);
    } else if (scripts.length === 1) {
      // Found the script
      matchingScript = scripts[0];
    } else {
      return setErrorStatusAndCallback(
          cb, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
          messages.SOURCE_FILE_AMBIGUOUS);
    }

    // TODO: Address the case where `breakpoint.location` is `null`.
    // TODO: Address the case where `fileStats[matchingScript]` is `null`.
    if ((breakpoint.location as apiTypes.SourceLocation).line >=
        (this.fileStats[matchingScript] as FileStats).lines) {
      return setErrorStatusAndCallback(
          cb, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
          messages.INVALID_LINE_NUMBER + matchingScript + ':' +
              (breakpoint.location as apiTypes.SourceLocation).line +
              '. Loaded script contained ' +
              (this.fileStats[matchingScript] as FileStats).lines +
              ' lines. Please ensure' +
              ' that the snapshot was set in the same code version as the' +
              ' deployed source.');
    }

    // The breakpoint protobuf message presently doesn't have a column property
    // but it may have one in the future.
    // TODO: Address the case where `breakpoint.location` is `null`.
    let column = mapInfo && mapInfo.column ?
        mapInfo.column :
        ((breakpoint.location as apiTypes.SourceLocation).column || 1);
    const line = mapInfo ?
        mapInfo.line :
        (breakpoint.location as apiTypes.SourceLocation).line;

    // We need to special case breakpoints on the first line. Since Node.js
    // wraps modules with a function expression, we adjust
    // to deal with that.
    if (line === 1) {
      column += MODULE_WRAP_PREFIX_LENGTH - 1;
    }

    const v8bp = this.setByRegExp(matchingScript, line, column);
    if (!v8bp) {
      return setErrorStatusAndCallback(
          cb, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
          messages.V8_BREAKPOINT_ERROR);
    }

    if (this.numBreakpoints === 0 && !this.usePermanentListener) {
      // added first breakpoint
      this.logger.info('activating v8 breakpoint listener');
      this.v8.setListener(this.handleDebugEvents);
    }

    // TODO: Address the case whree `breakpoint.id` is `null`.
    this.breakpoints[breakpoint.id as string] =
        // TODO: Address the case where `ast` is `null`.
        new v8breakpoint.V8BreakpointData(breakpoint, v8bp,
          ast as estree.Program, compile);
    this.numBreakpoints++;

    setImmediate(function() {
      cb(null);
    });  // success.
  }

  setByRegExp(
      scriptPath: string, line: number, column: number): v8Types.BreakPoint {
    const regexp = pathToRegExp(scriptPath);
    const num = this.v8.setScriptBreakPointByRegExp(regexp, line - 1, column - 1);
    const v8bp = this.v8.findBreakPoint(num);
    return v8bp;
  }

  handleDebugEvents(
    evt: v8Types.DebugEvent, execState: v8Types.ExecutionState,
    eventData: v8Types.BreakEvent): void {
    const that = this;
    try {
      switch (evt) {
        // TODO: Address the case where `v8` is `null`.
        case this.v8.DebugEvent.Break:
          eventData.breakPointsHit().forEach(function(hit) {
            const num = hit.script_break_point().number();
            if (that.listeners[num].enabled) {
              that.logger.info('>>>V8 breakpoint hit<<< number: ' + num);
              that.listeners[num].listener(execState, eventData);
            }
          });
          break;
        default:
      }
    } catch (e) {
      this.logger.warn('Internal V8 error on breakpoint event: ' + e);
    }
  }
}




export class InspectorDebugApi implements DebugApi {
  sourcemapper: SourceMapper;
  set(breakpoint: apiTypes.Breakpoint, cb: (err: Error|null) => void) {
    if (!breakpoint ||
      typeof breakpoint.id === 'undefined' ||  // 0 is a valid id
      !breakpoint.location || !breakpoint.location.path ||
      !breakpoint.location.line) {

      return setErrorStatusAndCallback(
          cb, breakpoint, StatusMessage.UNSPECIFIED,
          messages.INVALID_BREAKPOINT);
    }
    const baseScriptPath = path.normalize(breakpoint.location.path);
    if (!this.sourcemapper.hasMappingInfo(baseScriptPath)) {
      if (!_.endsWith(baseScriptPath, '.js')) {
        return setErrorStatusAndCallback(
            cb, breakpoint, StatusMessage.BREAKPOINT_SOURCE_LOCATION,
            messages.COULD_NOT_FIND_OUTPUT_FILE);
      }
      // setInternal(breakpoint, null /* mapInfo */, null /* compile */, cb);
    } else {

    }
  }
  constructor(sourcemapper_: SourceMapper) {
    this.sourcemapper = sourcemapper_;
  }
  numBreakpoints_(): number {
    // TODO: implement this.
    return 0;
  }

  numListeners_(): number {
    // TODO: implement this.
    return 0;
  }
}


export const messages = {
  INVALID_BREAKPOINT: 'invalid snapshot - id or location missing',
  SOURCE_FILE_NOT_FOUND:
      'A script matching the source file was not found loaded on the debuggee',
  SOURCE_FILE_AMBIGUOUS: 'Multiple files match the path specified',
  V8_BREAKPOINT_ERROR: 'Unable to set breakpoint in v8',
  SYNTAX_ERROR_IN_CONDITION: 'Syntax error in condition: ',
  ERROR_EVALUATING_CONDITION: 'Error evaluating condition: ',
  ERROR_COMPILING_CONDITION: 'Error compiling condition.',
  DISALLOWED_EXPRESSION: 'Expression not allowed',
  SOURCE_MAP_READ_ERROR:
      'The source map could not be read or was incorrectly formatted',
  V8_BREAKPOINT_DISABLED: 'Internal error: V8 breakpoint externally disabled',
  CAPTURE_BREAKPOINT_DATA: 'Error trying to capture snapshot data: ',
  INVALID_LINE_NUMBER: 'Invalid snapshot position: ',
  COULD_NOT_FIND_OUTPUT_FILE:
      'Could not determine the output file associated with the transpiled input file'
};

const MODULE_WRAP_PREFIX_LENGTH = require('module').wrap('☃').indexOf('☃');


export function setErrorStatusAndCallback(
  fn: (err: Error|null) => void, breakpoint: apiTypes.Breakpoint,
  refersTo: apiTypes.Reference, message: string): void {
  const error = new Error(message);
  return setImmediate(function() {
    if (breakpoint && !breakpoint.status) {
      breakpoint.status = new StatusMessage(refersTo, message, true);
    }
    fn(error);
  });
}

// Exposed for unit testing.
export function findScripts(
  scriptPath: string, config: DebugAgentConfig,
  fileStats: ScanStats): string[] {
  // Use repository relative mapping if present.
  if (config.appPathRelativeToRepository) {
    const candidate = scriptPath.replace(
        // TODO: Address the case where `config.workingDirectory` is `null`.
        config.appPathRelativeToRepository, config.workingDirectory as string);
    // There should be no ambiguity resolution if project root is provided.
    return fileStats[candidate] ? [candidate] : [];
  }
  const regexp = pathToRegExp(scriptPath);
  // Next try to match path.
  const matches = Object.keys(fileStats).filter(regexp.test.bind(regexp));
  if (matches.length === 1) {
    return matches;
  }

  // Finally look for files with the same name regardless of path.
  return findScriptsFuzzy(scriptPath, Object.keys(fileStats));
}


/**
 * Given an list of available files and a script path to match, this function
 * tries to resolve the script to a (hopefully unique) match in the file list
 * disregarding the full path to the script. This can be useful because repo
 * file paths (that the UI has) may not necessarily be suffixes of the absolute
 * paths of the deployed files. This happens when the user deploys a
 * subdirectory of the repo.
 *
 * For example consider a file named `a/b.js` in the repo. If the
 * directory contents of `a` are deployed rather than the whole repo, we are not
 * going to have any file named `a/b.js` in the running Node process.
 *
 * We incrementally consider more components of the path until we find a unique
 * match, or return all the potential matches.
 *
 * @example findScriptsFuzzy('a/b.js', ['/d/b.js']) // -> ['/d/b.js']
 * @example findScriptsFuzzy('a/b.js', ['/c/b.js', '/d/b.js']); // -> []
 * @example findScriptsFuzzy('a/b.js', ['/x/a/b.js', '/y/a/b.js'])
 *                 // -> ['x/a/b.js', 'y/a/b.js']
 *
 * @param {string} scriptPath partial path to the script.
 * @param {array<string>} fileList an array of absolute paths of filenames
 *     available.
 * @return {array<string>} list of files that match.
 */
export function findScriptsFuzzy(
  scriptPath: string, fileList: string[]): string[] {
let matches = fileList;
const components = scriptPath.split(path.sep);
for (let i = components.length - 1; i >= 0; i--) {
  const regexp = pathToRegExp(components.slice(i).join(path.sep));
  matches = matches.filter(regexp.test.bind(regexp));
  if (matches.length <= 1) {
    break;  // Either no matches, or we found a unique match.
  }
}
return matches;
}


/**
 * @param {!string} scriptPath path of a script
 */
function pathToRegExp(scriptPath: string): RegExp {
  // make sure the script path starts with a slash. This makes sure our
  // regexp doesn't match monkey.js when the user asks to set a breakpoint
  // in key.js
  if (path.sep === '/' || scriptPath.indexOf(':') === -1) {
    scriptPath = path.join(path.sep, scriptPath);
  }
  if (path.sep !== '/') {
    scriptPath = scriptPath.replace(new RegExp('\\\\', 'g'), '\\\\');
  }
  // Escape '.' characters.
  scriptPath = scriptPath.replace('.', '\\.');
  return new RegExp(scriptPath + '$');
}


