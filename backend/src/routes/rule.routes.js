/**
 * WFM Rules Routes
 */

const express = require('express');
const router = express.Router();
const ruleController = require('../controllers/rule.controller');
const { authenticate, requirePermission } = require('../middleware/auth.middleware');

router.use(authenticate);

// Get all rules (admins/supervisors)
router.get('/',
  requirePermission('rules', 'READ'),
  ruleController.getAllRules
);

// Get my applicable rules
router.get('/my-rules',
  requirePermission('rules', 'READ'),
  ruleController.getMyRules
);

// Get rule by ID
router.get('/:id',
  requirePermission('rules', 'READ'),
  ruleController.getRuleById
);

// Create rule
router.post('/',
  requirePermission('rules', 'CREATE'),
  ruleController.createRule
);

// Update rule
router.put('/:id',
  requirePermission('rules', 'UPDATE'),
  ruleController.updateRule
);

// Delete rule
router.delete('/:id',
  requirePermission('rules', 'DELETE'),
  ruleController.deleteRule
);

// Validate shift
router.post('/validate-shift',
  requirePermission('shifts', 'CREATE'),
  ruleController.validateShift
);

module.exports = router;
