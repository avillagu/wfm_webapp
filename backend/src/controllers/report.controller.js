/**
 * Report Controller
 * Text/plain exportable summaries and reports
 */

const { query } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Generate shift summary report (text/plain)
 * GET /api/reports/shifts?groupId=X&startDate=Y&endDate=Z
 */
const getShiftReport = asyncHandler(async (req, res) => {
  const { groupId, startDate, endDate } = req.query;

  if (!groupId || !startDate || !endDate) {
    return res.status(400).json({
      error: 'groupId, startDate, and endDate required',
      code: 'VALIDATION_ERROR'
    });
  }

  // Get group info
  const groupResult = await query(
    'SELECT name, code FROM groups WHERE id = $1',
    [groupId]
  );

  if (groupResult.rows.length === 0) {
    return res.status(404).json({
      error: 'Group not found',
      code: 'GROUP_NOT_FOUND'
    });
  }

  const group = groupResult.rows[0];

  // Get shifts
  const shiftsResult = await query(`
    SELECT 
      u.first_name,
      u.last_name,
      u.employee_code,
      s.shift_date,
      s.start_time,
      s.end_time,
      s.shift_type,
      EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600 AS hours
    FROM shifts s
    JOIN users u ON s.user_id = u.id
    WHERE s.group_id = $1
      AND s.shift_date BETWEEN $2 AND $3
      AND s.is_active = TRUE
    ORDER BY s.shift_date, u.last_name, s.start_time
  `, [groupId, startDate, endDate]);

  const shifts = shiftsResult.rows;

  // Calculate totals
  const totalHours = shifts.reduce((sum, s) => sum + parseFloat(s.hours), 0);
  const totalShifts = shifts.length;
  const sundayShifts = shifts.filter(s => new Date(s.shift_date).getDay() === 0).length;

  // Generate text report
  const report = generateTextReport({
    title: 'SHIFT SUMMARY REPORT',
    group: group.name,
    groupCode: group.code,
    period: `${startDate} to ${endDate}`,
    generatedAt: new Date().toISOString(),
    summary: {
      totalShifts,
      totalHours: totalHours.toFixed(2),
      sundayShifts
    },
    data: shifts
  });

  res.set('Content-Type', 'text/plain');
  res.set('Content-Disposition', `attachment; filename="shift-report-${group.code}-${startDate}.txt"`);
  res.send(report);
});

/**
 * Generate attendance report (text/plain)
 * GET /api/reports/attendance?groupId=X&startDate=Y&endDate=Z
 */
const getAttendanceReport = asyncHandler(async (req, res) => {
  const { groupId, startDate, endDate } = req.query;

  if (!groupId || !startDate || !endDate) {
    return res.status(400).json({
      error: 'groupId, startDate, and endDate required',
      code: 'VALIDATION_ERROR'
    });
  }

  // Get group info
  const groupResult = await query(
    'SELECT name, code FROM groups WHERE id = $1',
    [groupId]
  );

  if (groupResult.rows.length === 0) {
    return res.status(404).json({
      error: 'Group not found',
      code: 'GROUP_NOT_FOUND'
    });
  }

  const group = groupResult.rows[0];

  // Get punches
  const punchesResult = await query(`
    SELECT 
      u.first_name,
      u.last_name,
      u.employee_code,
      p.punch_in,
      p.punch_out,
      p.status,
      EXTRACT(EPOCH FROM (p.punch_out - p.punch_in)) / 3600 AS hours_worked
    FROM punches p
    JOIN users u ON p.user_id = u.id
    WHERE u.group_id = $1
      AND p.punch_in >= $2
      AND p.punch_in < ($3 + INTERVAL '1 day')
    ORDER BY p.punch_in DESC
  `, [groupId, startDate, endDate]);

  const punches = punchesResult.rows;

  // Calculate stats
  const onTime = punches.filter(p => p.status === 'ON_TIME').length;
  const late = punches.filter(p => p.status === 'LATE').length;

  const report = generateTextReport({
    title: 'ATTENDANCE REPORT',
    group: group.name,
    groupCode: group.code,
    period: `${startDate} to ${endDate}`,
    generatedAt: new Date().toISOString(),
    summary: {
      totalPunches: punches.length,
      onTime,
      late
    },
    data: punches
  });

  res.set('Content-Type', 'text/plain');
  res.set('Content-Disposition', `attachment; filename="attendance-report-${group.code}-${startDate}.txt"`);
  res.send(report);
});

/**
 * Generate change requests report (text/plain)
 * GET /api/reports/change-requests?groupId=X&startDate=Y&endDate=Z
 */
const getChangeRequestsReport = asyncHandler(async (req, res) => {
  const { groupId, startDate, endDate } = req.query;

  if (!groupId || !startDate || !endDate) {
    return res.status(400).json({
      error: 'groupId, startDate, and endDate required',
      code: 'VALIDATION_ERROR'
    });
  }

  // Get group info
  const groupResult = await query(
    'SELECT name, code FROM groups WHERE id = $1',
    [groupId]
  );

  if (groupResult.rows.length === 0) {
    return res.status(404).json({
      error: 'Group not found',
      code: 'GROUP_NOT_FOUND'
    });
  }

  const group = groupResult.rows[0];

  // Get change requests
  const requestsResult = await query(`
    SELECT 
      req.first_name AS requester_first,
      req.last_name AS requester_last,
      cr.request_type,
      cr.reason,
      cr.status,
      cr.created_at,
      cr.reviewed_at
    FROM change_requests cr
    JOIN users req ON cr.requester_id = req.id
    WHERE req.group_id = $1
      AND cr.created_at BETWEEN $2 AND $3
    ORDER BY cr.created_at DESC
  `, [groupId, startDate, endDate]);

  const requests = requestsResult.rows;

  const approved = requests.filter(r => r.status === 'APPROVED').length;
  const rejected = requests.filter(r => r.status === 'REJECTED').length;
  const pending = requests.filter(r => r.status === 'PENDING').length;

  const report = generateTextReport({
    title: 'CHANGE REQUESTS REPORT',
    group: group.name,
    groupCode: group.code,
    period: `${startDate} to ${endDate}`,
    generatedAt: new Date().toISOString(),
    summary: {
      totalRequests: requests.length,
      approved,
      rejected,
      pending
    },
    data: requests
  });

  res.set('Content-Type', 'text/plain');
  res.set('Content-Disposition', `attachment; filename="change-requests-report-${group.code}-${startDate}.txt"`);
  res.send(report);
});

/**
 * Generate dashboard summary (JSON)
 * GET /api/reports/dashboard?groupId=X
 */
const getDashboardSummary = asyncHandler(async (req, res) => {
  const groupId = req.query.groupId || req.user.accessibleGroupId;
  const today = new Date().toISOString().split('T')[0];

  // Get today's stats
  const [shiftStats, punchStats, changeStats] = await Promise.all([
    query(`
      SELECT COUNT(*) as total_shifts
      FROM shifts
      WHERE group_id = $1 AND shift_date = $2 AND is_active = TRUE
    `, [groupId, today]),

    query(`
      SELECT 
        COUNT(DISTINCT user_id) as clocked_in,
        COUNT(CASE WHEN punch_out IS NULL THEN 1 END) as currently_working
      FROM punches
      WHERE DATE(punch_in) = $1
        AND user_id IN (SELECT id FROM users WHERE group_id = $2)
    `, [today, groupId]),

    query(`
      SELECT 
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'APPROVED' THEN 1 END) as approved_today
      FROM change_requests
      WHERE DATE(created_at) = $1
        AND requester_id IN (SELECT id FROM users WHERE group_id = $2)
    `, [today, groupId])
  ]);

  res.json({
    date: today,
    shifts: {
      total: parseInt(shiftStats.rows[0].total_shifts)
    },
    attendance: {
      clockedIn: parseInt(punchStats.rows[0].clocked_in),
      currentlyWorking: parseInt(punchStats.rows[0].currently_working)
    },
    changeRequests: {
      pending: parseInt(changeStats.rows[0].pending),
      approvedToday: parseInt(changeStats.rows[0].approved_today)
    }
  });
});

/**
 * Helper: Generate formatted text report
 */
function generateTextReport({ title, group, groupCode, period, generatedAt, summary, data }) {
  const separator = '='.repeat(60);
  const lineSeparator = '-'.repeat(60);

  let report = '';
  report += `${separator}\n`;
  report += `  ${title}\n`;
  report += `${separator}\n\n`;
  report += `Group: ${group} (${groupCode})\n`;
  report += `Period: ${period}\n`;
  report += `Generated: ${generatedAt}\n\n`;
  report += `${lineSeparator}\n`;
  report += `  SUMMARY\n`;
  report += `${lineSeparator}\n`;

  for (const [key, value] of Object.entries(summary)) {
    report += `  ${formatLabel(key)}: ${value}\n`;
  }

  report += `\n${lineSeparator}\n`;
  report += `  DETAILS\n`;
  report += `${lineSeparator}\n`;

  if (data.length === 0) {
    report += `  No records found.\n`;
  } else {
    for (const row of data) {
      report += `\n`;
      for (const [key, value] of Object.entries(row)) {
        if (value !== null && value !== undefined) {
          report += `  ${formatLabel(key)}: ${value}\n`;
        }
      }
      report += `${'-'.repeat(40)}\n`;
    }
  }

  report += `\n${separator}\n`;
  report += `  END OF REPORT\n`;
  report += `${separator}\n`;

  return report;
}

/**
 * Helper: Format label (snake_case to Title Case)
 */
function formatLabel(label) {
  return label
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

module.exports = {
  getShiftReport,
  getAttendanceReport,
  getChangeRequestsReport,
  getDashboardSummary
};
