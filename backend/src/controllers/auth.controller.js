/**
 * Auth Controller
 * Login, logout, and user authentication endpoints
 */

const bcrypt = require('bcrypt');
const userDAO = require('../dao/user.dao');
const { generateToken, generateRefreshToken } = require('../utils/token');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateLogin } = require('../middleware/validation');

/**
 * Login endpoint
 * POST /api/auth/login
 */
const login = [
  validateLogin,
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    // Find user
    const user = await userDAO.findByUsername(username);

    if (!user || !user.is_active) {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Update last login
    await userDAO.updateLastLogin(user.id);

    // Generate tokens
    const tokenPayload = {
      userId: user.id,
      username: user.username,
      roleId: user.role_id
    };

    const accessToken = generateToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Remove sensitive data from response
    const { password_hash, ...userWithoutPassword } = user;

    res.json({
      user: userWithoutPassword,
      token: accessToken,
      refreshToken,
      expiresIn: process.env.JWT_EXPIRES_IN || '8h'
    });
  })
];

/**
 * Refresh token endpoint
 * POST /api/auth/refresh
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      error: 'Refresh token required',
      code: 'VALIDATION_ERROR'
    });
  }

  try {
    const { userId, username, roleId } = generateToken(refreshToken);
    
    // Verify user still exists and is active
    const user = await userDAO.findById(userId);
    
    if (!user || !user.is_active) {
      return res.status(401).json({
        error: 'User not found or inactive',
        code: 'USER_NOT_FOUND'
      });
    }

    const newAccessToken = generateToken({ userId, username, roleId });

    res.json({
      token: newAccessToken,
      expiresIn: process.env.JWT_EXPIRES_IN || '8h'
    });
  } catch (err) {
    return res.status(401).json({
      error: 'Invalid refresh token',
      code: 'INVALID_TOKEN'
    });
  }
});

/**
 * Get current user profile
 * GET /api/auth/me
 */
const getProfile = asyncHandler(async (req, res) => {
  const user = await userDAO.findById(req.user.id);
  
  if (!user) {
    return res.status(404).json({
      error: 'User not found',
      code: 'USER_NOT_FOUND'
    });
  }

  const { password_hash, ...userWithoutPassword } = user;

  res.json(userWithoutPassword);
});

/**
 * Change password
 * PUT /api/auth/change-password
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      error: 'Current and new password required',
      code: 'VALIDATION_ERROR'
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      error: 'Password must be at least 6 characters',
      code: 'VALIDATION_ERROR'
    });
  }

  // Get current user
  const user = await userDAO.findByUsername(req.user.username);

  // Verify current password
  const isValid = await bcrypt.compare(currentPassword, user.password_hash);

  if (!isValid) {
    return res.status(401).json({
      error: 'Current password is incorrect',
      code: 'INVALID_PASSWORD'
    });
  }

  // Hash new password
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
  const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

  // Update password
  await userDAO.updatePassword(user.id, newPasswordHash);

  res.json({
    message: 'Password changed successfully',
    code: 'PASSWORD_CHANGED'
  });
});

module.exports = {
  login,
  refreshToken,
  getProfile,
  changePassword
};
