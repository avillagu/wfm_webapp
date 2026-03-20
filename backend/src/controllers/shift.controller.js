/**
 * Shift Controller
 * Shift/Calendar management with WFM validation
 */

const shiftDAO = require('../dao/shift.dao');
const wfmRulesDAO = require('../dao/wfmRules.dao');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateShift } = require('../middleware/validation');
const { emitToGroup } = require('../services/socket.service');

/**
 * Get shifts for calendar view
 * GET /api/shifts/calendar?groupId=X&startDate=Y&endDate=Z
 */
const getCalendarShifts = asyncHandler(async (req, res) => {
  const { groupId, startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      error: 'startDate and endDate required',
      code: 'VALIDATION_ERROR'
    });
  }

  let shifts;

  if (req.user.accessibleGroupId) {
    // Analyst - only their group
    shifts = await shiftDAO.findByGroupIdAndDateRange(
      req.user.accessibleGroupId,
      startDate,
      endDate
    );
  } else if (groupId) {
    // Admin/Supervisor - specific group
    shifts = await shiftDAO.findByGroupIdAndDateRange(groupId, startDate, endDate);
  } else {
    // Admin/Supervisor - all accessible groups
    const groupIds = await getUserAccessibleGroups(req.user.id);
    shifts = await shiftDAO.findForCalendar(groupIds, startDate, endDate);
  }

  res.json(shifts);
});

/**
 * Get shifts by user
 * GET /api/shifts/user/:userId?startDate=X&endDate=Y
 */
const getUserShifts = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      error: 'startDate and endDate required',
      code: 'VALIDATION_ERROR'
    });
  }

  // Check access
  if (req.user.roleName === 'ANALYST' && parseInt(req.params.userId) !== req.user.id) {
    return res.status(403).json({
      error: 'Can only view own shifts',
      code: 'FORBIDDEN'
    });
  }

  const shifts = await shiftDAO.findByUserIdAndDateRange(
    req.params.userId,
    startDate,
    endDate
  );

  res.json(shifts);
});

/**
 * Create new shift with WFM validation
 * POST /api/shifts
 */
const createShift = [
  validateShift,
  asyncHandler(async (req, res) => {
    const { userId, groupId, shiftDate, startTime, endTime, shiftType } = req.body;

    // Check for overlapping shifts
    const overlaps = await shiftDAO.checkOverlap(userId, shiftDate, startTime, endTime);
    if (overlaps.length > 0) {
      return res.status(409).json({
        error: 'Shift overlaps with existing shift',
        code: 'SHIFT_OVERLAP',
        overlaps
      });
    }

    // WFM Intelligence validation
    const validation = await wfmRulesDAO.validateShift(
      userId,
      groupId,
      shiftDate,
      startTime,
      endTime
    );

    // If there are violations, return warning
    if (!validation.valid) {
      return res.status(400).json({
        error: 'WFM rule violations detected',
        code: 'WFM_VIOLATION',
        violations: validation.violations,
        warnings: validation.warnings
      });
    }

    // Create shift
    const shift = await shiftDAO.create({
      userId,
      groupId,
      shiftDate,
      startTime,
      endTime,
      shiftType,
      createdBy: req.user.id
    });

    // Emit socket event (optional, may not have io attached)
    try {
      if (req.io) {
        emitToGroup(req.io, groupId, 'shift:updated', {
          shiftId: shift.id,
          action: 'created',
          shift,
          updatedBy: req.user.username
        });
      }
    } catch(e) { /* socket not available */ }

    res.status(201).json({
      message: 'Shift created successfully',
      shift,
      warnings: validation.warnings
    });
  })
];

/**
 * Create multiple shifts (bulk)
 * POST /api/shifts/bulk
 */
const createBulkShifts = asyncHandler(async (req, res) => {
  const { shifts } = req.body;

  if (!Array.isArray(shifts) || shifts.length === 0) {
    return res.status(400).json({
      error: 'Shifts array required',
      code: 'VALIDATION_ERROR'
    });
  }

  // Validate each shift — skip invalid ones instead of rejecting all
  const validatedShifts = [];
  const warnings = [];

  for (const shiftData of shifts) {
    // Check overlap
    const overlaps = await shiftDAO.checkOverlap(
      shiftData.userId,
      shiftData.shiftDate,
      shiftData.startTime,
      shiftData.endTime
    );

    if (overlaps.length > 0) {
      warnings.push({
        shift: shiftData,
        error: 'Overlaps with existing shift — skipped'
      });
      continue;
    }

    // WFM validation — warn but still allow
    const validation = await wfmRulesDAO.validateShift(
      shiftData.userId,
      shiftData.groupId,
      shiftData.shiftDate,
      shiftData.startTime,
      shiftData.endTime
    );

    if (!validation.valid) {
      // Log the warning but still create the shift
      warnings.push({
        shift: shiftData,
        warning: 'WFM rule warning — shift created anyway',
        violations: validation.violations
      });
    }

    validatedShifts.push({
      ...shiftData,
      createdBy: req.user.id
    });
  }

  let createdShifts = [];
  if (validatedShifts.length > 0) {
    createdShifts = await shiftDAO.createMany(validatedShifts);

    // Emit socket events (optional)
    try {
      if (req.io) {
        const groupIds = [...new Set(validatedShifts.map(s => s.groupId))];
        groupIds.forEach(groupId => {
          emitToGroup(req.io, groupId, 'shift:updated', {
            action: 'bulk_created',
            count: createdShifts.length,
            updatedBy: req.user.username
          });
        });
      }
    } catch(e) { /* socket not available */ }
  }

  res.status(201).json({
    message: `${createdShifts.length} shifts created successfully`,
    shifts: createdShifts,
    warnings: warnings.length > 0 ? warnings : undefined,
    skipped: warnings.length
  });
});

/**
 * Get shift by ID
 * GET /api/shifts/:id
 */
const getShiftById = asyncHandler(async (req, res) => {
  const shift = await shiftDAO.findById(req.params.id);

  if (!shift) {
    return res.status(404).json({
      error: 'Shift not found',
      code: 'SHIFT_NOT_FOUND'
    });
  }

  res.json(shift);
});

/**
 * Update shift
 * PUT /api/shifts/:id
 */
const updateShift = asyncHandler(async (req, res) => {
  const { userId, groupId, shiftDate, startTime, endTime, shiftType } = req.body;

  const existingShift = await shiftDAO.findById(req.params.id);
  
  if (!existingShift) {
    return res.status(404).json({
      error: 'Shift not found',
      code: 'SHIFT_NOT_FOUND'
    });
  }

  // Check for overlaps (excluding current shift)
  if (shiftDate && startTime && endTime) {
    const overlaps = await shiftDAO.checkOverlap(
      userId || existingShift.user_id,
      shiftDate || existingShift.shift_date,
      startTime || existingShift.start_time,
      endTime || existingShift.end_time,
      req.params.id
    );

    if (overlaps.length > 0) {
      return res.status(409).json({
        error: 'Shift overlaps with existing shift',
        code: 'SHIFT_OVERLAP',
        overlaps
      });
    }

    // WFM validation
    const validation = await wfmRulesDAO.validateShift(
      userId || existingShift.user_id,
      groupId || existingShift.group_id,
      shiftDate || existingShift.shift_date,
      startTime || existingShift.start_time,
      endTime || existingShift.end_time
    );

    if (!validation.valid) {
      return res.status(400).json({
        error: 'WFM rule violations detected',
        code: 'WFM_VIOLATION',
        violations: validation.violations
      });
    }
  }

  const shift = await shiftDAO.update(req.params.id, {
    userId,
    groupId,
    shiftDate,
    startTime,
    endTime,
    shiftType
  });

  // Emit socket event (optional)
  try {
    if (req.io) {
      emitToGroup(req.io, shift.group_id, 'shift:updated', {
        shiftId: shift.id,
        action: 'updated',
        shift,
        updatedBy: req.user.username
      });
    }
  } catch(e) { /* socket not available */ }

  res.json({
    message: 'Shift updated successfully',
    shift
  });
});

/**
 * Delete shift
 * DELETE /api/shifts/:id
 */
const deleteShift = asyncHandler(async (req, res) => {
  const shift = await shiftDAO.delete(req.params.id);

  if (!shift) {
    return res.status(404).json({
      error: 'Shift not found',
      code: 'SHIFT_NOT_FOUND'
    });
  }

  // Emit socket event (optional)
  try {
    if (req.io) {
      emitToGroup(req.io, shift.group_id, 'shift:updated', {
        shiftId: shift.id,
        action: 'deleted',
        updatedBy: req.user.username
      });
    }
  } catch(e) { /* socket not available */ }

  res.json({
    message: 'Shift deleted successfully',
    shift
  });
});

/**
 * Get shift statistics
 * GET /api/shifts/stats?groupId=X&startDate=Y&endDate=Z
 */
const getShiftStats = asyncHandler(async (req, res) => {
  const { groupId, startDate, endDate } = req.query;

  if (!groupId || !startDate || !endDate) {
    return res.status(400).json({
      error: 'groupId, startDate, and endDate required',
      code: 'VALIDATION_ERROR'
    });
  }

  const stats = await shiftDAO.getStatistics(groupId, startDate, endDate);
  res.json(stats);
});

// Helper: Get user accessible groups
async function getUserAccessibleGroups(userId) {
  const { query } = require('../config/database');
  const text = `
    SELECT DISTINCT g.id
    FROM groups g
    LEFT JOIN users u ON g.id = u.group_id
    WHERE u.id = $1 OR g.is_active = TRUE
  `;
  const result = await query(text, [userId]);
  return result.rows.map(r => r.id);
}

module.exports = {
  getCalendarShifts,
  getUserShifts,
  createShift,
  createBulkShifts,
  getShiftById,
  updateShift,
  deleteShift,
  getShiftStats
};
