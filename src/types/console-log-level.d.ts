export interface ConsoleLogLevelOptions {
  level?: string;
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
