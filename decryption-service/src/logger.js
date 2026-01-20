/**
 * Logger Configuration
 * 
 * Structured logging with Winston
 * - Console output for development
 * - File rotation for production
 * - JSON formatting for log aggregation
 */

import winston from 'winston';
import path from 'path';

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

// Custom format for console (human-readable)
const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}] ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  
  return msg;
});

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })
  ),
  defaultMeta: { service: 'decryption-service' },
  transports: []
});

// Console transport (always enabled)
logger.add(new winston.transports.Console({
  format: combine(
    colorize(),
    consoleFormat
  )
}));

// File transports (production)
if (process.env.NODE_ENV === 'production') {
  // Error log
  logger.add(new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'error.log'),
    level: 'error',
    format: json(),
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));

  // Combined log
  logger.add(new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'combined.log'),
    format: json(),
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
}

export default logger;
