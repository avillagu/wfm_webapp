/**
 * Punch DAO - Data Access Object for punches (Time & Attendance) table
 */

const { query } = require('../config/database');

class PunchDAO {
  /**
   * Create clock-in record
   */
  async clockIn(userId, shiftId = null, location = null) {
    const text = `
      INSERT INTO punches (user_id, shift_id, punch_in, punch_in_location, status)
      VALUES ($1, $2, CURRENT_TIMESTAMP, $3, 'ON_TIME')
      RETURNING *
    `;
    const result = await query(text, [userId, shiftId, location]);
    return result.rows[0];
  }

  /**
   * Create clock-out record
   */
  async clockOut(punchId, location = null) {
    const text = `
      UPDATE punches
      SET 
        punch_out = CURRENT_TIMESTAMP,
        punch_out_location = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    const result = await query(text, [location, punchId]);
    return result.rows[0];
  }

  /**
   * Get active punch (clocked in but not out) for user
   */
  async getActivePunch(userId) {
    const text = `
      SELECT 
        p.*,
        s.shift_date,
        s.start_time,
        s.end_time
      FROM punches p
      LEFT JOIN shifts s ON p.shift_id = s.id
      WHERE p.user_id = $1
        AND p.punch_out IS NULL
      ORDER BY p.punch_in DESC
      LIMIT 1
    `;
    const result = await query(text, [userId]);
    return result.rows[0];
  }

  /**
   * Find punch by ID
   */
  async findById(id) {
    const text = `
      SELECT 
        p.*,
        u.first_name,
        u.last_name,
        u.employee_code,
        s.shift_date,
        s.start_time,
        s.end_time
      FROM punches p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN shifts s ON p.shift_id = s.id
      WHERE p.id = $1
    `;
    const result = await query(text, [id]);
    return result.rows[0];
  }

  /**
   * Get punches by user and date range
   */
  async findByUserIdAndDateRange(userId, startDate, endDate) {
    const text = `
      SELECT 
        p.*,
        s.shift_date,
        s.shift_type
      FROM punches p
      LEFT JOIN shifts s ON p.shift_id = s.id
      WHERE p.user_id = $1
        AND p.punch_in >= $2
        AND p.punch_in < ($3 + INTERVAL '1 day')
      ORDER BY p.punch_in DESC
    `;
    const result = await query(text, [userId, startDate, endDate]);
    return result.rows;
  }

  /**
   * Get punches by group and date range
   */
  async findByGroupIdAndDateRange(groupId, startDate, endDate) {
    const text = `
      SELECT 
        p.*,
        u.first_name,
        u.last_name,
        u.employee_code,
        s.shift_date,
        s.shift_type
      FROM punches p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN shifts s ON p.shift_id = s.id
      WHERE u.group_id = $1
        AND p.punch_in >= $2
        AND p.punch_in < ($3 + INTERVAL '1 day')
      ORDER BY p.punch_in DESC
    `;
    const result = await query(text, [groupId, startDate, endDate]);
    return result.rows;
  }

  /**
   * Update punch status
   */
  async updateStatus(punchId, status, notes = null) {
    const text = `
      UPDATE punches
      SET 
        status = $1,
        notes = COALESCE($2, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
    const result = await query(text, [status, notes, punchId]);
    return result.rows[0];
  }

  /**
   * Get today's punches summary for dashboard
   */
  async getTodaySummary(groupId = null) {
    let text = `
      SELECT 
        COUNT(DISTINCT p.user_id) AS total_users_clocked_in,
        COUNT(CASE WHEN p.punch_out IS NULL THEN 1 END) AS currently_working,
        COUNT(CASE WHEN p.status = 'LATE' THEN 1 END) AS late_arrivals
      FROM punches p
      JOIN users u ON p.user_id = u.id
      WHERE DATE(p.punch_in) = CURRENT_DATE
    `;
    
    const values = [];
    if (groupId) {
      text += ' AND u.group_id = $1';
      values.push(groupId);
    }

    const result = await query(text, values);
    return result.rows[0];
  }
}

module.exports = new PunchDAO();
