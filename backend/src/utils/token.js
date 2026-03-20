/**
 * JWT Token Utility
 * Generate and verify JWT tokens
 */

const jwt = require('jsonwebtoken');

/**
 * Generate access token
 */
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    issuer: 'wfm-backend',
    audience: 'wfm-frontend'
  });
};

/**
 * Generate refresh token
 */
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    issuer: 'wfm-backend',
    audience: 'wfm-frontend'
  });
};

/**
 * Verify token
 */
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET, {
    issuer: 'wfm-backend',
    audience: 'wfm-frontend'
  });
};

/**
 * Decode token without verification
 */
const decodeToken = (token) => {
  return jwt.decode(token);
};

/**
 * Get token expiration time
 */
const getTokenExpiration = (token) => {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) {
    return null;
  }
  return new Date(decoded.exp * 1000);
};

/**
 * Check if token is expired
 */
const isTokenExpired = (token) => {
  try {
    verifyToken(token);
    return false;
  } catch (err) {
    return err.name === 'TokenExpiredError';
  }
};

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken,
  decodeToken,
  getTokenExpiration,
  isTokenExpired
};
