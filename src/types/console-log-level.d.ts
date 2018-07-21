export enum LogLevels {
  trace = 'trace',
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error',
  fatal = 'fatal'
}

export interface ConsoleLogLevelOptions {
  level?: LogLevels;
  stderr?: boolean;
  prefix?: string | Function;
}

export interface ConsoleLogLevel {
  (opts: ConsoleLogLevelOptions): ConsoleLogLevelLog;
}
export interface ConsoleLogLevelLog {
  fatal: (...args: any[]) => void;
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  info: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  trace: (...args: any[]) => void;
}
