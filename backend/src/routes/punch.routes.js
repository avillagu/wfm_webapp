/**
 * Punch Routes
 */

const express = require('express');
const router = express.Router();
const punchController = require('../controllers/punch.controller');
const { authenticate, requirePermission, checkGroupAccess } = require('../middleware/auth.middleware');

router.use(authenticate);

// Clock actions
router.post('/clock-in', punchController.clockIn);
router.post('/clock-out', punchController.clockOut);

// Get active punch
router.get('/active', punchController.getActivePunch);

// Today's summary
router.get('/today/summary',
  checkGroupAccess('groupId'),
  requirePermission('punches', 'READ'),
  punchController.getTodaySummary
);

// Get punches
router.get('/',
  checkGroupAccess('groupId'),
  requirePermission('punches', 'READ'),
  punchController.getPunches
);

// Update punch status
router.put('/:id/status',
  requirePermission('punches', 'UPDATE'),
  punchController.updatePunchStatus
);

module.exports = router;
