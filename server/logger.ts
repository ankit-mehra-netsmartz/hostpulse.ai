type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function formatLog(level: LogLevel, tag: string, ...args: any[]) {
  const timestamp = new Date().toISOString();
  const prefix = `${timestamp} [${level.toUpperCase()}] [${tag}]`;

  switch (level) {
    case 'error':
      console.error(prefix, ...args);
      break;
    case 'warn':
      console.warn(prefix, ...args);
      break;
    case 'debug':
      console.debug(prefix, ...args);
      break;
    default:
      console.log(prefix, ...args);
  }
}

export const logger = {
  info: (tag: string, ...args: any[]) => formatLog('info', tag, ...args),
  warn: (tag: string, ...args: any[]) => formatLog('warn', tag, ...args),
  error: (tag: string, ...args: any[]) => formatLog('error', tag, ...args),
  debug: (tag: string, ...args: any[]) => formatLog('debug', tag, ...args),
};
