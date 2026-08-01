/**
 * Simple logger utility for frontend.
 * In production, logs are suppressed unless explicitly enabled.
 * In development, all logs are shown.
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const appConsole = globalThis.console;

export const logger = {
  log: (...args: unknown[]) => {
    if (isDevelopment) {
      appConsole.log(...args);
    }
  },

  info: (...args: unknown[]) => {
    if (isDevelopment) {
      appConsole.info(...args);
    }
  },

  warn: (...args: unknown[]) => {
    if (isDevelopment) {
      appConsole.warn(...args);
    }
  },

  error: (...args: unknown[]) => {
    // Always log errors, but could be sent to monitoring service in production
    appConsole.error(...args);
  },

  debug: (...args: unknown[]) => {
    if (isDevelopment) {
      appConsole.debug(...args);
    }
  },
};

export default logger;
