/**
 * Authentication Middleware
 * JWT token validation and user context injection
 */

const jwt = require('jsonwebtoken');
const userDAO = require('../dao/user.dao');

/**
 * Verify JWT token from Authorization header
 * Injects user context into request object
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'NO_TOKEN'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from database
    const user = await userDAO.findById(decoded.userId);

    if (!user || !user.is_active) {
      return res.status(401).json({
        error: 'User not found or inactive',
        code: 'USER_NOT_FOUND'
      });
    }

    // Attach user context to request
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      roleId: user.role_id,
      roleName: user.role_name,
      groupId: user.group_id,
      groupName: user.group_name,
      permissions: [] // Will be populated if needed
    };

    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    console.error('Auth middleware error:', err);
    return res.status(500).json({
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Check if user has required permission
 * Usage: requirePermission('shifts', 'CREATE')
 */
const requirePermission = (resource, action) => {
  return async (req, res, next) => {
    try {
      const userDAO = require('../dao/user.dao');
      const permissions = await userDAO.getUserPermissions(req.user.id);
      
      req.user.permissions = permissions;

      const hasPermission = permissions.some(
        p => p.resource === resource && 
             (p.action === action || p.action === '*')
      );

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'FORBIDDEN',
          required: `${resource}:${action}`
        });
      }

      next();
    } catch (err) {
      console.error('Permission check error:', err);
      return res.status(500).json({
        error: 'Permission check failed',
        code: 'PERMISSION_ERROR'
      });
    }
  };
};

/**
 * Check if user has required role
 * Usage: requireRole(['ADMIN', 'SUPERVISOR'])
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.roleName)) {
      return res.status(403).json({
        error: 'Insufficient role permissions',
        code: 'FORBIDDEN',
        required: roles,
        current: req.user.roleName
      });
    }
    next();
  };
};

/**
 * Check if user can access group data
 * Analysts can only access their own group
 * Supervisors and Admins can access all groups
 */
const checkGroupAccess = (groupIdParamName = 'groupId') => {
  return async (req, res, next) => {
    const requestedGroupId = req.params[groupIdParamName] || req.query[groupIdParamName];

    // Admin and Supervisor can access all groups
    if (['ADMIN', 'SUPERVISOR'].includes(req.user.roleName)) {
      return next();
    }

    // Analyst can only access their own group
    if (req.user.roleName === 'ANALYST') {
      if (!req.user.groupId) {
        return res.status(403).json({
          error: 'Analyst must be assigned to a group',
          code: 'NO_GROUP_ASSIGNMENT'
        });
      }

      // If groupId is provided, it must match user's group
      if (requestedGroupId && parseInt(requestedGroupId) !== req.user.groupId) {
        return res.status(403).json({
          error: 'Access denied to this group',
          code: 'GROUP_ACCESS_DENIED'
        });
      }

      // Inject user's group ID for queries
      req.user.accessibleGroupId = req.user.groupId;
    }

    next();
  };
};

/**
 * Optional authentication - attaches user if token is valid
 * but doesn't block if no token is present
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await userDAO.findById(decoded.userId);
      
      if (user && user.is_active) {
        req.user = {
          id: user.id,
          username: user.username,
          roleId: user.role_id,
          roleName: user.role_name,
          groupId: user.group_id
        };
      }
    }
    
    next();
  } catch (err) {
    // Token invalid but continue without user context
    next();
  }
};

module.exports = {
  authenticate,
  requirePermission,
  requireRole,
  checkGroupAccess,
  optionalAuth
};
