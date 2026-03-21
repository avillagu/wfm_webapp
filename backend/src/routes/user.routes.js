/**
 * User Routes
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate, requirePermission, checkGroupAccess } = require('../middleware/auth.middleware');

// Database migration route (temporary)
router.get('/internal/setup-activity', async (req, res) => {
  const { query } = require('../config/database');
  try {
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS current_activity VARCHAR(50) DEFAULT 'Fuera de turno'");
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS activity_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP");
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS activity_start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP");
    res.json({ message: 'Migration successful' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All routes require authentication
router.use(authenticate);

router.get('/', 
  requirePermission('users', 'READ'),
  userController.getAllUsers
);

router.get('/group/:groupId',
  checkGroupAccess('groupId'),
  requirePermission('users', 'READ'),
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
