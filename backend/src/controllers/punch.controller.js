/**
 * Punch Controller
 * Time & Attendance (Clock-In/Clock-Out)
 */

const punchDAO = require('../dao/punch.dao');
const shiftDAO = require('../dao/shift.dao');
const { asyncHandler } = require('../middleware/errorHandler');
const { emitToGroup } = require('../services/socket.service');

/**
 * Clock In
 * POST /api/punches/clock-in
 */
const clockIn = asyncHandler(async (req, res) => {
  const { shiftId, location } = req.body;

  // Check if already clocked in
  const activePunch = await punchDAO.getActivePunch(req.user.id);
  if (activePunch) {
    return res.status(400).json({
      error: 'Already clocked in',
      code: 'ALREADY_CLOCKED_IN',
      punch: activePunch
    });
  }

  // If shiftId provided, verify it's for today and for this user
  if (shiftId) {
    const shift = await shiftDAO.findById(shiftId);
    if (!shift) {
      return res.status(404).json({
        error: 'Shift not found',
        code: 'SHIFT_NOT_FOUND'
      });
    }
    if (shift.user_id !== req.user.id) {
      return res.status(403).json({
        error: 'Not your shift',
        code: 'FORBIDDEN'
      });
    }
  }

  // Create punch record
  const punch = await punchDAO.clockIn(req.user.id, shiftId, location);

  // Emit socket event (optional)
  try {
    if (req.io) {
      emitToGroup(req.io, req.user.groupId, 'punch:updated', {
        userId: req.user.id,
        username: req.user.username,
        action: 'clock_in',
        timestamp: punch.punch_in
      });
    }
  } catch(e) { /* socket not available */ }

  res.status(201).json({
    message: 'Clocked in successfully',
    punch
  });
});

/**
 * Clock Out
 * POST /api/punches/clock-out
 */
const clockOut = asyncHandler(async (req, res) => {
  const { punchId, location } = req.body;

  // Get active punch
  let activePunch;
  
  if (punchId) {
    activePunch = await punchDAO.findById(punchId);
    if (!activePunch) {
      return res.status(404).json({
        error: 'Punch record not found',
        code: 'PUNCH_NOT_FOUND'
      });
    }
    if (activePunch.user_id !== req.user.id) {
      return res.status(403).json({
        error: 'Not your punch record',
        code: 'FORBIDDEN'
      });
    }
  } else {
    activePunch = await punchDAO.getActivePunch(req.user.id);
  }

  if (!activePunch) {
    return res.status(400).json({
      error: 'Not currently clocked in',
      code: 'NOT_CLOCKED_IN'
    });
  }

  // Clock out
  const updatedPunch = await punchDAO.clockOut(activePunch.id, location);

  // Emit socket event (optional)
  try {
    if (req.io) {
      emitToGroup(req.io, req.user.groupId, 'punch:updated', {
        userId: req.user.id,
        username: req.user.username,
        action: 'clock_out',
        timestamp: updatedPunch.punch_out
      });
    }
  } catch(e) { /* socket not available */ }

  res.json({
    message: 'Clocked out successfully',
    punch: updatedPunch
  });
});

/**
 * Get active punch for current user
 * GET /api/punches/active
 */
const getActivePunch = asyncHandler(async (req, res) => {
  const punch = await punchDAO.getActivePunch(req.user.id);
  res.json(punch || null);
});

/**
 * Get punches by date range
 * GET /api/punches?startDate=X&endDate=Y&userId=Z
 */
const getPunches = asyncHandler(async (req, res) => {
  const { startDate, endDate, userId } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      error: 'startDate and endDate required',
      code: 'VALIDATION_ERROR'
    });
  }

  let punches;

  if (userId) {
    // Specific user
    if (req.user.roleName === 'ANALYST' && parseInt(userId) !== req.user.id) {
      return res.status(403).json({
        error: 'Can only view own punches',
        code: 'FORBIDDEN'
      });
    }
    punches = await punchDAO.findByUserIdAndDateRange(userId, startDate, endDate);
  } else if (req.user.accessibleGroupId) {
    // Analyst - own group
    punches = await punchDAO.findByGroupIdAndDateRange(
      req.user.accessibleGroupId,
      startDate,
      endDate
    );
  } else {
    // Admin/Supervisor - can specify groupId or see all accessible
    const qGroupId = req.query.groupId;
    if (qGroupId) {
      punches = await punchDAO.findByGroupIdAndDateRange(qGroupId, startDate, endDate);
    } else {
       // If no group specified, return for all today (for the Monitor)
       punches = await punchDAO.findByDateRange(startDate, endDate);
    }
  }

  res.json(punches);
});

/**
 * Get today's summary for dashboard
 * GET /api/punches/today/summary?groupId=X
 */
const getTodaySummary = asyncHandler(async (req, res) => {
  const groupId = req.query.groupId || req.user.accessibleGroupId;
  const summary = await punchDAO.getTodaySummary(groupId);
  res.json(summary);
});

/**
 * Update punch status (for supervisors/admins)
 * PUT /api/punches/:id/status
 */
const updatePunchStatus = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;

  const validStatuses = ['ON_TIME', 'LATE', 'EARLY_DEPARTURE', 'MISSED'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      error: 'Invalid status',
      code: 'VALIDATION_ERROR',
      validStatuses
    });
  }

  const punch = await punchDAO.updateStatus(req.params.id, status, notes);

  if (!punch) {
    return res.status(404).json({
      error: 'Punch not found',
      code: 'PUNCH_NOT_FOUND'
    });
  }

  res.json({
    message: 'Punch status updated',
    punch
  });
});

module.exports = {
  clockIn,
  clockOut,
  getActivePunch,
  getPunches,
  getTodaySummary,
  updatePunchStatus
};
