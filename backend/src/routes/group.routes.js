/**
 * Group Routes
 */

const express = require('express');
const router = express.Router();
const groupController = require('../controllers/group.controller');
const { authenticate, requirePermission } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/',
  requirePermission('groups', 'READ'),
  groupController.getAllGroups
);

router.get('/:id',
  requirePermission('groups', 'READ'),
  groupController.getGroupById
);

router.post('/',
  requirePermission('groups', 'CREATE'),
  groupController.createGroup
);

router.put('/:id',
  requirePermission('groups', 'UPDATE'),
  groupController.updateGroup
);

router.delete('/:id',
  requirePermission('groups', 'DELETE'),
  groupController.deleteGroup
);

module.exports = router;
