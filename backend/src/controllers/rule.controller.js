/**
 * WFM Rules Controller
 * Workforce intelligence rules management
 */

const wfmRulesDAO = require('../dao/wfmRules.dao');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Get all rules
 * GET /api/rules
 */
const getAllRules = asyncHandler(async (req, res) => {
  const rules = await wfmRulesDAO.findAll();
  res.json(rules);
});

/**
 * Get rules applicable to current user
 * GET /api/rules/my-rules
 */
const getMyRules = asyncHandler(async (req, res) => {
  const rules = await wfmRulesDAO.getRulesForUser(
    req.user.id,
    req.user.groupId
  );
  res.json(rules);
});

/**
 * Get rule by ID
 * GET /api/rules/:id
 */
const getRuleById = asyncHandler(async (req, res) => {
  const rule = await wfmRulesDAO.findById(req.params.id);

  if (!rule) {
    return res.status(404).json({
      error: 'Rule not found',
      code: 'RULE_NOT_FOUND'
    });
  }

  res.json(rule);
});

/**
 * Create new rule
 * POST /api/rules
 */
const createRule = asyncHandler(async (req, res) => {
  const { name, ruleType, value, description, isGlobal, groupId, userId } = req.body;

  const rule = await wfmRulesDAO.create({
    name,
    ruleType,
    value,
    description,
    isGlobal,
    groupId,
    userId
  });

  res.status(201).json({
    message: 'Rule created successfully',
    rule
  });
});

/**
 * Update rule
 * PUT /api/rules/:id
 */
const updateRule = asyncHandler(async (req, res) => {
  const { name, value, description, isActive } = req.body;

  const rule = await wfmRulesDAO.update(req.params.id, {
    name,
    value,
    description,
    isActive
  });

  if (!rule) {
    return res.status(404).json({
      error: 'Rule not found',
      code: 'RULE_NOT_FOUND'
    });
  }

  res.json({
    message: 'Rule updated successfully',
    rule
  });
});

/**
 * Delete rule (soft delete)
 * DELETE /api/rules/:id
 */
const deleteRule = asyncHandler(async (req, res) => {
  const rule = await wfmRulesDAO.delete(req.params.id);

  if (!rule) {
    return res.status(404).json({
      error: 'Rule not found',
      code: 'RULE_NOT_FOUND'
    });
  }

  res.json({
    message: 'Rule deleted successfully',
    rule
  });
});

/**
 * Validate shift against rules (manual check)
 * POST /api/rules/validate-shift
 */
const validateShift = asyncHandler(async (req, res) => {
  const { userId, groupId, shiftDate, startTime, endTime } = req.body;

  if (!userId || !groupId || !shiftDate || !startTime || !endTime) {
    return res.status(400).json({
      error: 'Missing required fields',
      code: 'VALIDATION_ERROR'
    });
  }

  const validation = await wfmRulesDAO.validateShift(
    userId,
    groupId,
    shiftDate,
    startTime,
    endTime
  );

  res.json(validation);
});

module.exports = {
  getAllRules,
  getMyRules,
  getRuleById,
  createRule,
  updateRule,
  deleteRule,
  validateShift
};
