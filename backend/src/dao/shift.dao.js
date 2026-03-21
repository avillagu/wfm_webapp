/**
 * Shift DAO - Data Access Object for shifts table
 * All queries use parameterized statements for SQL injection immunity
 */

const { query, getClient } = require('../config/database');

class ShiftDAO {
  /**
   * Create new shift
   */
  async create(shiftData) {
    const text = `
      INSERT INTO shifts (
        user_id, group_id, shift_date, start_time, end_time,
        shift_type, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [
      shiftData.userId,
      shiftData.groupId,
      shiftData.shiftDate,
      shiftData.startTime,
      shiftData.endTime,
      shiftData.shiftType,
      shiftData.createdBy
    ];
    const result = await query(text, values);
    return result.rows[0];
  }

  /**
   * Create multiple shifts (bulk insert)
   */
  async createMany(shiftsData) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      
      const insertedShifts = [];
      
      for (const shiftData of shiftsData) {
        const text = `
          INSERT INTO shifts (
            user_id, group_id, shift_date, start_time, end_time,
            shift_type, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `;
        const values = [
          shiftData.userId,
          shiftData.groupId,
          shiftData.shiftDate,
          shiftData.startTime,
          shiftData.endTime,
          shiftData.shiftType,
          shiftData.createdBy
        ];
        const result = await client.query(text, values);
        insertedShifts.push(result.rows[0]);
      }
      
      await client.query('COMMIT');
      return insertedShifts;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Find shift by ID
   */
  async findById(id) {
    const text = `
      SELECT 
        s.*,
        u.first_name,
        u.last_name,
        u.employee_code,
        g.name AS group_name,
        g.code AS group_code,
        creator.first_name AS creator_first_name,
        creator.last_name AS creator_last_name
      FROM shifts s
      JOIN users u ON s.user_id = u.id
      JOIN groups g ON s.group_id = g.id
      JOIN users creator ON s.created_by = creator.id
      WHERE s.id = $1
    `;
    const result = await query(text, [id]);
    return result.rows[0];
  }

  /**
   * Get shifts by user ID and date range
   */
  async findByUserIdAndDateRange(userId, startDate, endDate) {
    const text = `
      SELECT 
        s.*,
        g.name AS group_name,
        g.code AS group_code
      FROM shifts s
      JOIN groups g ON s.group_id = g.id
      WHERE s.user_id = $1
        AND s.shift_date BETWEEN $2 AND $3
        AND s.is_active = TRUE
      ORDER BY s.shift_date, s.start_time
    `;
    const result = await query(text, [userId, startDate, endDate]);
    return result.rows;
  }

  /**
   * Get shifts by group ID and date range
   */
  async findByGroupIdAndDateRange(groupId, startDate, endDate) {
    const text = `
      SELECT 
        s.*,
        u.first_name,
        u.last_name,
        u.employee_code
      FROM shifts s
      JOIN users u ON s.user_id = u.id
      WHERE s.group_id = $1
        AND s.shift_date BETWEEN $2 AND $3
        AND s.is_active = TRUE
      ORDER BY s.shift_date, s.start_time, u.last_name
    `;
    const result = await query(text, [groupId, startDate, endDate]);
    return result.rows;
  }

  /**
   * Get all shifts for calendar view (multiple groups)
   */
  async findForCalendar(groupIds, startDate, endDate) {
    const text = `
      SELECT 
        s.*,
        u.first_name,
        u.last_name,
        u.employee_code,
        g.name AS group_name,
        g.code AS group_code
      FROM shifts s
      JOIN users u ON s.user_id = u.id
      JOIN groups g ON s.group_id = g.id
      WHERE s.group_id = ANY($1)
        AND s.shift_date BETWEEN $2 AND $3
        AND s.is_active = TRUE
      ORDER BY s.shift_date, s.start_time, g.name, u.last_name
    `;
    const result = await query(text, [groupIds, startDate, endDate]);
    return result.rows;
  }

  /**
   * Update shift
   */
  async update(id, shiftData) {
    const fields = [];
    const values = [];
    let index = 1;

    if (shiftData.userId !== undefined) {
      fields.push(`user_id = $${index++}`);
      values.push(shiftData.userId);
    }
    if (shiftData.groupId !== undefined) {
      fields.push(`group_id = $${index++}`);
      values.push(shiftData.groupId);
    }
    if (shiftData.shiftDate !== undefined) {
      fields.push(`shift_date = $${index++}`);
      values.push(shiftData.shiftDate);
    }
    if (shiftData.startTime !== undefined) {
      fields.push(`start_time = $${index++}`);
      values.push(shiftData.startTime);
    }
    if (shiftData.endTime !== undefined) {
      fields.push(`end_time = $${index++}`);
      values.push(shiftData.endTime);
    }
    if (shiftData.shiftType !== undefined) {
      fields.push(`shift_type = $${index++}`);
      values.push(shiftData.shiftType);
    }

    if (fields.length === 0) {
      return await this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const text = `
      UPDATE shifts
      SET ${fields.join(', ')}
      WHERE id = $${index}
      RETURNING *
    `;

    const result = await query(text, values);
    return result.rows[0];
  }

  /**
   * Delete shift (soft delete)
   */
  async delete(id) {
    const text = `
      UPDATE shifts
      SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const result = await query(text, [id]);
    return result.rows[0];
  }

  /**
   * Delete multiple shifts in bulk
   */
  async deleteBulk(userIds, startDate, endDate, groupId) {
    let text = `
      UPDATE shifts
      SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE shift_date BETWEEN $1 AND $2
        AND group_id = $3
        AND is_active = TRUE
    `;
    const values = [startDate, endDate, groupId];
    
    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      text += ` AND user_id = ANY($4)`;
      values.push(userIds);
    }

    text += ` RETURNING *`;
    
    const result = await query(text, values);
    return result.rows;
  }

  /**
   * Check for overlapping shifts for a user on a date
   */
  async checkOverlap(userId, shiftDate, startTime, endTime, excludeShiftId = null) {
    let text = `
      SELECT id, shift_date, start_time, end_time, shift_type
      FROM shifts
      WHERE user_id = $1
        AND shift_date = $2
        AND is_active = TRUE
        AND (
          ($3 >= start_time AND $3 < end_time) OR
          ($4 > start_time AND $4 <= end_time) OR
          ($3 <= start_time AND $4 >= end_time)
        )
    `;
    
    const values = [userId, shiftDate, startTime, endTime];
    
    if (excludeShiftId) {
      text += ' AND id != $5';
      values.push(excludeShiftId);
    }

    const result = await query(text, values);
    return result.rows;
  }

  /**
   * Get shifts for a specific date
   */
  async findByDate(date) {
    const text = `
      SELECT 
        s.*,
        u.first_name,
        u.last_name,
        u.employee_code,
        g.name AS group_name
      FROM shifts s
      JOIN users u ON s.user_id = u.id
      JOIN groups g ON s.group_id = g.id
      WHERE s.shift_date = $1
        AND s.is_active = TRUE
      ORDER BY g.name, u.last_name, s.start_time
    `;
    const result = await query(text, [date]);
    return result.rows;
  }

  /**
   * Count shifts by user in date range
   */
  async countByUserAndDateRange(userId, startDate, endDate) {
    const text = `
      SELECT COUNT(*) as total
      FROM shifts
      WHERE user_id = $1
        AND shift_date BETWEEN $2 AND $3
        AND is_active = TRUE
    `;
    const result = await query(text, [userId, startDate, endDate]);
    return parseInt(result.rows[0].total);
  }

  /**
   * Get shift statistics for a period
   */
  async getStatistics(groupId, startDate, endDate) {
    const text = `
      SELECT 
        COUNT(DISTINCT s.user_id) AS total_users,
        COUNT(*) AS total_shifts,
        SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600) AS total_hours,
        COUNT(CASE WHEN EXTRACT(DOW FROM s.shift_date) = 0 THEN 1 END) AS sunday_shifts
      FROM shifts s
      WHERE s.group_id = $1
        AND s.shift_date BETWEEN $2 AND $3
        AND s.is_active = TRUE
    `;
    const result = await query(text, [groupId, startDate, endDate]);
    return result.rows[0];
  }
}

module.exports = new ShiftDAO();
