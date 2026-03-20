/**
 * Shift Routes
 */

const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shift.controller');
const { authenticate, requirePermission, checkGroupAccess } = require('../middleware/auth.middleware');

router.use(authenticate);

// Calendar view
router.get('/calendar',
  checkGroupAccess('groupId'),
  requirePermission('shifts', 'READ'),
  shiftController.getCalendarShifts
);

// User shifts
router.get('/user/:userId',
  requirePermission('shifts', 'READ'),
  shiftController.getUserShifts
);

// Statistics
router.get('/stats',
  checkGroupAccess('groupId'),
  requirePermission('shifts', 'READ'),
  shiftController.getShiftStats
);

// Single shift
router.get('/:id',
  requirePermission('shifts', 'READ'),
  shiftController.getShiftById
);

// Create shift
router.post('/',
  requirePermission('shifts', 'CREATE'),
  shiftController.createShift
);

// Bulk create shifts
router.post('/bulk',
  requirePermission('shifts', 'CREATE'),
  shiftController.createBulkShifts
);

// Update shift
router.put('/:id',
  requirePermission('shifts', 'UPDATE'),
  shiftController.updateShift
);

// Delete shift
router.delete('/:id',
  requirePermission('shifts', 'DELETE'),
  shiftController.deleteShift
);

module.exports = router;
