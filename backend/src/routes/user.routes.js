/**
 * User Routes
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate, requirePermission, checkGroupAccess } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(authenticate);

router.get('/', 
  requirePermission('users', 'READ'),
  userController.getAllUsers
);

router.get('/group/:groupId',
  checkGroupAccess('groupId'),
  userController.getUsersByGroup
);

// ACTIVITY STATUS ROUTES
router.put('/me/activity', userController.updateActivity);

router.get('/:id',
  requirePermission('users', 'READ'),
  userController.getUserById
);

router.post('/',
  requirePermission('users', 'CREATE'),
  userController.createUser
);

router.put('/:id',
  requirePermission('users', 'UPDATE'),
  userController.updateUser
);

router.delete('/:id',
  requirePermission('users', 'DELETE'),
  userController.deleteUser
);

module.exports = router;
