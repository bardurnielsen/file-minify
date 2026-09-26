const path = require('path');
const winston = require('winston');
const { DATA_DIR } = require('./paths');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create logger
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'file-minify-backend' },
  transports: [
    // Write to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          info => `${info.timestamp} ${info.level}: ${info.message}`
        )
      )
    }),
    // Console only in Docker: `docker compose logs` keeps it. The log files
    // that used to be written here lived in the container's writable layer,
    // were lost on every rebuild, and nothing read them.
    //
    // The Windows build also keeps a file (FM_DATA_DIR\logs), since its
    // console window is gone once closed: someone helping a user remotely
    // asks for this file. Three files of at most 5 MB, oldest dropped.
    ...(DATA_DIR ? [new winston.transports.File({
      filename: path.join(DATA_DIR, 'logs', 'fileminify.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
      tailable: true,
      format: winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`),
    })] : []),
  ],
});

module.exports = logger;