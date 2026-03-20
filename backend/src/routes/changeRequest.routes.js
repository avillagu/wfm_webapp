/**
 * Change Request Routes
 */

const express = require('express');
const router = express.Router();
const changeRequestController = require('../controllers/changeRequest.controller');
const { authenticate, requirePermission, checkGroupAccess } = require('../middleware/auth.middleware');

router.use(authenticate);

// My requests
router.get('/my-requests', changeRequestController.getMyRequests);

// Pending review (supervisors/admins)
router.get('/pending-review',
  checkGroupAccess('groupId'),
  requirePermission('change_requests', 'READ'),
  changeRequestController.getPendingReview
);

// Statistics
router.get('/stats',
  checkGroupAccess('groupId'),
  requirePermission('change_requests', 'READ'),
  changeRequestController.getStats
);

// Single request
router.get('/:id', changeRequestController.getRequestById);

// Create request
router.post('/',
  requirePermission('change_requests', 'CREATE'),
  changeRequestController.createChangeRequest
);

// Target response
router.post('/:id/target-response',
  requirePermission('change_requests', 'CREATE'),
  changeRequestController.targetResponse
);

// Final review (supervisors/admins)
router.post('/:id/review',
  requirePermission('change_requests', 'APPROVE'),
  changeRequestController.finalReview
);

// Cancel request
router.delete('/:id',
  requirePermission('change_requests', 'CREATE'),
  changeRequestController.cancelRequest
);

module.exports = router;
