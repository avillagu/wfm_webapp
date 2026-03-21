/**
 * User Controller
 * User management endpoints (CRUD)
 */

const bcrypt = require('bcrypt');
const userDAO = require('../dao/user.dao');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateUserCreate } = require('../middleware/validation');

/**
 * Get all users with pagination and filters
 * GET /api/users
 */
const getAllUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const filters = {
    groupId: req.query.groupId ? parseInt(req.query.groupId) : null,
    roleId: req.query.roleId ? parseInt(req.query.roleId) : null,
    isActive: req.query.isActive ? req.query.isActive === 'true' : undefined,
    search: req.query.search || null
  };

  const [users, total] = await Promise.all([
    userDAO.findAll(page, limit, filters),
    userDAO.count(filters)
  ]);

  res.json({
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

/**
 * Get user by ID
 * GET /api/users/:id
 */
const getUserById = asyncHandler(async (req, res) => {
  const user = await userDAO.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      error: 'User not found',
      code: 'USER_NOT_FOUND'
    });
  }

  res.json(user);
});

/**
 * Create new user
 * POST /api/users
 */
const createUser = [
  validateUserCreate,
  asyncHandler(async (req, res) => {
    const { username, email, password, firstName, lastName, employeeCode, roleId, groupId } = req.body;

    // Check if username or email already exists
    const existingUser = await userDAO.findByUsername(username);
    if (existingUser) {
      return res.status(409).json({
        error: 'Username already exists',
        code: 'DUPLICATE_ENTRY'
      });
    }

    // Hash password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await userDAO.create({
      username,
      email,
      passwordHash,
      firstName,
      lastName,
      employeeCode,
      roleId,
      groupId
    });

    res.status(201).json({
      message: 'User created successfully',
      user
    });
  })
];

/**
 * Update user
 * PUT /api/users/:id
 */
const updateUser = asyncHandler(async (req, res) => {
  const { email, firstName, lastName, roleId, groupId, isActive } = req.body;

  const user = await userDAO.update(req.params.id, {
    email,
    firstName,
    lastName,
    roleId,
    groupId,
    isActive
  });

  if (!user) {
    return res.status(404).json({
      error: 'User not found',
      code: 'USER_NOT_FOUND'
    });
  }

  res.json({
    message: 'User updated successfully',
    user
  });
});

/**
 * Delete user (soft delete)
 * DELETE /api/users/:id
 */
const deleteUser = asyncHandler(async (req, res) => {
  const user = await userDAO.delete(req.params.id);

  if (!user) {
    return res.status(404).json({
      error: 'User not found',
      code: 'USER_NOT_FOUND'
    });
  }

  res.json({
    message: 'User deleted successfully',
    user
  });
});

/**
 * Get users by group
 * GET /api/users/group/:groupId
 */
const getUsersByGroup = asyncHandler(async (req, res) => {
  const users = await userDAO.findByGroupId(req.params.groupId);
  res.json(users);
});

/**
 * Update user activity
 * PUT /api/users/me/activity
 */
const updateActivity = asyncHandler(async (req, res) => {
  const { activity } = req.body;
  if (!activity) {
    return res.status(400).json({ error: 'Activity state required' });
  }

  const updatedUser = await userDAO.updateActivity(req.user.id, activity);

  // Opt: Emit socket event so admins see the new state in real-time
  try {
    const { emitToGroup } = require('../services/socket.service');
    if (req.io && req.user.groupId) {
      emitToGroup(req.io, req.user.groupId, 'user:activity', {
        userId: req.user.id,
        activity
      });
    }
  } catch(e) {}

  res.json({
    message: 'Activity updated',
    user: updatedUser
  });
});

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getUsersByGroup,
  updateActivity
};
