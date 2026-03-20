/**
 * Logger Utility
 * Centralized logging with levels
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const currentLevel = process.env.NODE_ENV === 'production' 
  ? LOG_LEVELS.INFO 
  : LOG_LEVELS.DEBUG;

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  gray: '\x1b[90m'
};

const formatMessage = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
};

const log = (level, levelColor, message, meta) => {
  if (currentLevel >= LOG_LEVELS[level]) {
    const formattedMessage = formatMessage(level, message, meta);
    console.log(`${levelColor}${formattedMessage}${colors.reset}`);
  }
};

const logger = {
  error: (message, meta) => log('ERROR', colors.red, message, meta),
  warn: (message, meta) => log('WARN', colors.yellow, message, meta),
  info: (message, meta) => log('INFO', colors.blue, message, meta),
  debug: (message, meta) => log('DEBUG', colors.gray, message, meta),
  
  // Log HTTP requests
  http: (req, res, duration) => {
    if (currentLevel >= LOG_LEVELS.DEBUG) {
      const method = req.method.padEnd(6);
      const status = res.statusCode;
      const statusColor = status >= 400 ? colors.red : 
                         status >= 300 ? colors.yellow : colors.green;
      
      console.log(
        `[${new Date().toISOString()}] ${method} ${req.originalUrl} ` +
        `${statusColor}${status}${colors.reset} ${colors.gray}${duration}ms${colors.reset}`
      );
    }
  },

  // Log errors with stack trace
  logError: (err, req) => {
    console.error(colors.red + formatMessage('ERROR', err.message, {
      path: req?.path,
      method: req?.method,
      userId: req?.user?.id,
      stack: err.stack
    }) + colors.reset);
  }
};

module.exports = logger;
