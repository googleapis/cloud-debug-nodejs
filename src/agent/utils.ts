import * as path from 'path';

import {DebugAgentConfig} from './config';
import {ScanStats} from './scanner';


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


/**
 * Formats a provided message and a high-resolution interval of the format
 * [seconds, nanoseconds] (for example, from process.hrtime()) prefixed with a
 * provided message as a string intended for logging.
 * @param {string} msg The mesage that prefixes the formatted interval.
 * @param {number[]} interval The interval to format.
 * @return {string} A formatted string.
 */
export const formatInterval = function(msg: string, interval: number[]): string {
  return msg + (interval[0] * 1000 + interval[1] / 1000000) + 'ms';
};
