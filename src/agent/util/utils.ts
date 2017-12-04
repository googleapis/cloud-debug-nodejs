import * as path from 'path';

import {StatusMessage} from '../../client/stackdriver/status-message';
import * as stackdriver from '../../types/stackdriver';

import {DebugAgentConfig} from '../config';
import {ScanStats} from '../io/scanner';


export const messages = {
  INVALID_BREAKPOINT: 'invalid snapshot - id or location missing',
  SOURCE_FILE_NOT_FOUND:
      'A script matching the source file was not found loaded on the debuggee',
  SOURCE_FILE_AMBIGUOUS: 'Multiple files match the path specified',
  V8_BREAKPOINT_ERROR: 'Unable to set breakpoint in v8',
  V8_BREAKPOINT_CLEAR_ERROR: 'Unable to clear breakpoint in v8',
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
      'Could not determine the output file associated with the transpiled input file',
  ASYNC_TRACES_WARNING:
      'The Stackdriver Debugger for Node.js does not require V8 Inspector ' +
      'async stack traces. The INSPECTOR_ASYNC_STACK_TRACES_NOT_AVAILABLE ' +
      'can be ignored.',
  INSPECTOR_NOT_AVAILABLE:
      'The V8 Inspector protocol is only available in Node 8+'
};

export interface Listener {
  enabled: boolean;
  listener: (...args: Array<{}>) => {};
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
export function pathToRegExp(scriptPath: string): RegExp {
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


/**
 * Formats a provided message and a high-resolution interval of the format
 * [seconds, nanoseconds] (for example, from process.hrtime()) prefixed with a
 * provided message as a string intended for logging.
 * @param {string} msg The mesage that prefixes the formatted interval.
 * @param {number[]} interval The interval to format.
 * @return {string} A formatted string.
 */
export const formatInterval = (
    msg: string, interval: number[]): string => {
  return msg + (interval[0] * 1000 + interval[1] / 1000000) + 'ms';
};


export function setErrorStatusAndCallback(
    fn: (err: Error|null) => void, breakpoint: stackdriver.Breakpoint,
    refersTo: stackdriver.Reference, message: string): void {
  const error = new Error(message);
  return setImmediate(() => {
    if (breakpoint && !breakpoint.status) {
      breakpoint.status = new StatusMessage(refersTo, message, true);
    }
    fn(error);
  });
}

/**
 * Produces a compilation function based on the file extension of the
 * script path in which the breakpoint is set.
 *
 * @param {Breakpoint} breakpoint
 */
export function getBreakpointCompiler(breakpoint: stackdriver.Breakpoint):
    ((uncompiled: string) => string)|null {
  // TODO: Address the case where `breakpoint.location` is `null`.
  switch (
      path.normalize((breakpoint.location as stackdriver.SourceLocation).path)
          .split('.')
          .pop()) {
    case 'coffee':
      return (uncompiled) => {
        const comp = require('coffee-script');
        const compiled = comp.compile('0 || (' + uncompiled + ')');
        // Strip out coffeescript scoping wrapper to get translated condition
        const re = /\(function\(\) {\s*0 \|\| \((.*)\);\n\n\}\)\.call\(this\);/;
        const match = re.exec(compiled);
        if (match && match.length > 1) {
          return match[1].trim();
        } else {
          throw new Error('Compilation Error for: ' + uncompiled);
        }
      };
    case 'es6':
    case 'es':
    case 'jsx':
      return (uncompiled) => {
        // If we want to support es6 watch expressions we can compile them
        // here. Babel is a large dependency to have if we don't need it in
        // all cases.
        return uncompiled;
      };
    default:
      return null;
  }
}

export function removeFirstOccurrenceInArray<T>(array: T[], element: T): void {
  const index = array.indexOf(element);
  if (index >= 0) {
    array.splice(index, 1);
  }
}
