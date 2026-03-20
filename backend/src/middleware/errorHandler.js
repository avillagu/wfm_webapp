/**
 * Global Error Handler Middleware
 * Centralized error handling and logging
 */

const { errorHandler: logError } = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let code = err.code || 'INTERNAL_ERROR';

  // Log error
  logError(err, req);

  // PostgreSQL specific errors
  if (err.code) {
    switch (err.code) {
      case '23505': // Unique violation
        statusCode = 409;
        message = 'Resource already exists';
        code = 'DUPLICATE_ENTRY';
        break;
      case '23503': // Foreign key violation
        statusCode = 400;
        message = 'Referenced resource not found';
        code = 'FOREIGN_KEY_VIOLATION';
        break;
      case '23502': // Not null violation
        statusCode = 400;
        message = 'Required field missing';
        code = 'NOT_NULL_VIOLATION';
        break;
      case '23506': // Check constraint violation
        statusCode = 400;
        message = 'Data validation failed';
        code = 'CHECK_VIOLATION';
        break;
      case '42P01': // Undefined table
        statusCode = 500;
        message = 'Database configuration error';
        code = 'DB_CONFIG_ERROR';
        break;
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    code = 'INVALID_TOKEN';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    code = 'TOKEN_EXPIRED';
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
  }

  // Send error response
  res.status(statusCode).json({
    error: message,
    code,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Async handler wrapper to catch promise rejections
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  asyncHandler,
  AppError
};
