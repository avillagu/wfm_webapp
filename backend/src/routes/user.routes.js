/**
 * User Routes
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate, requirePermission, checkGroupAccess } = require('../middleware/auth.middleware');

// Diagnostic & Migration routes (temporary, NO AUTH REQUIRED)
router.get('/internal/check-db', async (req, res) => {
  const { query } = require('../config/database');
  try {
    const colResult = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `);
    
    const consResult = await query(`
      SELECT constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_name = 'users'
    `);

    res.json({ 
      columns: colResult.rows, 
      constraints: consResult.rows 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/internal/setup-activity', async (req, res) => {
  const { query } = require('../config/database');
  try {
    // 1. Ensure columns exist
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS current_activity VARCHAR(50)");
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS activity_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP");
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS activity_start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP");
    
    // 2. Set default for existing rows without activity
    await query("UPDATE users SET current_activity = 'Fuera de turno' WHERE current_activity IS NULL");
    
    // 3. Remove blocking shift constraints
    try {
      await query("ALTER TABLE shifts DROP CONSTRAINT IF EXISTS chk_shift_times");
    } catch(e) {}
    
    res.json({ message: 'Database columns and defaults fixed' });
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
