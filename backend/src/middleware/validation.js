/**
 * Validation Middleware
 * Request body validation utilities
 */

const { AppError } = require('./errorHandler');

/**
 * Validate required fields in request body
 */
const validateFields = (requiredFields) => {
  return (req, res, next) => {
    const missing = requiredFields.filter(field => {
      const value = req.body[field];
      return value === undefined || value === null || value === '';
    });

    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        code: 'VALIDATION_ERROR',
        fields: missing
      });
    }

    next();
  };
};

/**
 * Validate email format
 */
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate time format (HH:MM)
 */
const validateTime = (time) => {
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return timeRegex.test(time);
};

/**
 * Validate date format (YYYY-MM-DD)
 */
const validateDate = (date) => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) return false;
  
  const d = new Date(date);
  return d instanceof Date && !isNaN(d);
};

/**
 * Validate shift data
 */
const validateShift = (req, res, next) => {
  const { userId, groupId, shiftDate, startTime, endTime, shiftType } = req.body;

  // Required fields
  if (!userId || !groupId || !shiftDate || !startTime || !endTime || !shiftType) {
    return res.status(400).json({
      error: 'Missing required fields',
      code: 'VALIDATION_ERROR',
      fields: ['userId', 'groupId', 'shiftDate', 'startTime', 'endTime', 'shiftType']
    });
  }

  // Validate date
  if (!validateDate(shiftDate)) {
    return res.status(400).json({
      error: 'Invalid date format. Use YYYY-MM-DD',
      code: 'VALIDATION_ERROR'
    });
  }

  // Validate times
  if (!validateTime(startTime) || !validateTime(endTime)) {
    return res.status(400).json({
      error: 'Invalid time format. Use HH:MM (24h)',
      code: 'VALIDATION_ERROR'
    });
  }

  // Validate shift type
  const validTypes = ['MORNING', 'AFTERNOON', 'NIGHT'];
  if (!validTypes.includes(shiftType)) {
    return res.status(400).json({
      error: 'Invalid shift type',
      code: 'VALIDATION_ERROR',
      validTypes
    });
  }

  next();
};

/**
 * Validate user creation data
 */
const validateUserCreate = (req, res, next) => {
  const { username, email, firstName, lastName, roleId } = req.body;

  if (!username || !email || !firstName || !lastName || !roleId) {
    return res.status(400).json({
      error: 'Missing required fields',
      code: 'VALIDATION_ERROR',
      fields: ['username', 'email', 'firstName', 'lastName', 'roleId']
    });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({
      error: 'Invalid email format',
      code: 'VALIDATION_ERROR'
    });
  }

  next();
};

/**
 * Validate login data
 */
const validateLogin = (req, res, next) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      error: 'Username and password required',
      code: 'VALIDATION_ERROR'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      error: 'Password must be at least 6 characters',
      code: 'VALIDATION_ERROR'
    });
  }

  next();
};

/**
 * Validate change request data
 */
const validateChangeRequest = (req, res, next) => {
  const { requestType, shiftId, reason } = req.body;

  if (!requestType || !shiftId || !reason) {
    return res.status(400).json({
      error: 'Missing required fields',
      code: 'VALIDATION_ERROR',
      fields: ['requestType', 'shiftId', 'reason']
    });
  }

  const validTypes = ['SHIFT_SWAP', 'REST_DAY_REQUEST', 'DIRECT_REQUEST'];
  if (!validTypes.includes(requestType)) {
    return res.status(400).json({
      error: 'Invalid request type',
      code: 'VALIDATION_ERROR',
      validTypes
    });
  }

  if (requestType === 'SHIFT_SWAP' && !req.body.targetUserId) {
    return res.status(400).json({
      error: 'Target user required for shift swap',
      code: 'VALIDATION_ERROR'
    });
  }

  next();
};

module.exports = {
  validateFields,
  validateEmail,
  validateTime,
  validateDate,
  validateShift,
  validateUserCreate,
  validateLogin,
  validateChangeRequest
};
