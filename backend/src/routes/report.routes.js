/**
 * Report Routes
 */

const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { authenticate, requirePermission, checkGroupAccess } = require('../middleware/auth.middleware');

router.use(authenticate);

// Dashboard summary
router.get('/dashboard',
  checkGroupAccess('groupId'),
  requirePermission('reports', 'EXPORT'),
  reportController.getDashboardSummary
);

// Shift report (text/plain)
router.get('/shifts',
  checkGroupAccess('groupId'),
  requirePermission('reports', 'EXPORT'),
  reportController.getShiftReport
);

// Attendance report (text/plain)
router.get('/attendance',
  checkGroupAccess('groupId'),
  requirePermission('reports', 'EXPORT'),
  reportController.getAttendanceReport
);

// Change requests report (text/plain)
router.get('/change-requests',
  checkGroupAccess('groupId'),
  requirePermission('reports', 'EXPORT'),
  reportController.getChangeRequestsReport
);

module.exports = router;
