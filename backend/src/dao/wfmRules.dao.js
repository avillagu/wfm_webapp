/**
 * WFM Rules Engine DAO - Data Access Object for WFM intelligence
 * Handles hour calculations, Sunday counts, and rest day validations
 */

const { query } = require('../config/database');

class WfmRulesDAO {
  /**
   * Get all active rules for a user (including global and group rules)
   */
  async getRulesForUser(userId, groupId = null) {
    const text = `
      SELECT 
        id, name, rule_type, value, description, is_global
      FROM wfm_rules
      WHERE is_active = TRUE
        AND (
          is_global = TRUE
          OR (group_id = $1 AND user_id IS NULL)
          OR user_id = $2
        )
      ORDER BY 
        CASE WHEN user_id = $2 THEN 1
             WHEN group_id = $1 THEN 2
             ELSE 3
        END
    `;
    const result = await query(text, [groupId, userId]);
    return result.rows;
  }

  /**
   * Get specific rule by type for a user
   */
  async getRuleByType(ruleType, userId, groupId = null) {
    const text = `
      SELECT id, name, rule_type, value, description
      FROM wfm_rules
      WHERE rule_type = $1
        AND is_active = TRUE
        AND (
          is_global = TRUE
          OR (group_id = $2 AND user_id IS NULL)
          OR user_id = $3
        )
      ORDER BY 
        CASE WHEN user_id = $3 THEN 1
             WHEN group_id = $2 THEN 2
             ELSE 3
        END
      LIMIT 1
    `;
    const result = await query(text, [ruleType, groupId, userId]);
    return result.rows[0];
  }

  /**
   * Calculate total hours worked by user in a week
   */
  async getWeeklyHours(userId, weekStart) {
    const text = `
      SELECT 
        COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600), 0) AS total_hours
      FROM shifts
      WHERE user_id = $1
        AND shift_date >= $2
        AND shift_date < ($2 + INTERVAL '7 days')
        AND is_active = TRUE
    `;
    const result = await query(text, [userId, weekStart]);
    return parseFloat(result.rows[0].total_hours);
  }

  /**
   * Calculate total hours worked by user in a month
   */
  async getMonthlyHours(userId, monthStart) {
    const text = `
      SELECT 
        COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600), 0) AS total_hours
      FROM shifts
      WHERE user_id = $1
        AND shift_date >= $2
        AND shift_date < ($2 + INTERVAL '1 month')
        AND is_active = TRUE
    `;
    const result = await query(text, [userId, monthStart]);
    return parseFloat(result.rows[0].total_hours);
  }

  /**
   * Count Sundays worked by user in a month
   */
  async getSundayCount(userId, monthStart) {
    const text = `
      SELECT COUNT(*) AS sunday_count
      FROM shifts
      WHERE user_id = $1
        AND shift_date >= $2
        AND shift_date < ($2 + INTERVAL '1 month')
        AND EXTRACT(DOW FROM shift_date) = 0
        AND is_active = TRUE
    `;
    const result = await query(text, [userId, monthStart]);
    return parseInt(result.rows[0].sunday_count);
  }

  /**
   * Get shifts in a date range for a user
   */
  async getShiftsInRange(userId, startDate, endDate) {
    const text = `
      SELECT 
        id, shift_date, start_time, end_time, shift_type
      FROM shifts
      WHERE user_id = $1
        AND shift_date BETWEEN $2 AND $3
        AND is_active = TRUE
      ORDER BY shift_date, start_time
    `;
    const result = await query(text, [userId, startDate, endDate]);
    return result.rows;
  }

  /**
   * Check minimum rest hours between shifts
   */
  async checkMinRestHours(userId, shiftDate, startTime, minRestHours) {
    // Check previous day's shifts
    const prevDayText = `
      SELECT end_time, shift_date
      FROM shifts
      WHERE user_id = $1
        AND shift_date = $2
        AND is_active = TRUE
      ORDER BY end_time DESC
      LIMIT 1
    `;
    
    const prevResult = await query(prevDayText, [userId, shiftDate]);
    
    if (prevResult.rows.length > 0) {
      const prevShift = prevResult.rows[0];
      // Calculate hours between previous shift end and new shift start
      const prevEnd = new Date(`${prevShift.shift_date}T${prevShift.end_time}`);
      const newStart = new Date(`${shiftDate}T${startTime}`);
      const hoursDiff = (newStart - prevEnd) / (1000 * 60 * 60);
      
      if (hoursDiff < minRestHours) {
        return {
          violates: true,
          message: `Insufficient rest hours. Only ${hoursDiff.toFixed(1)}h since previous shift ended at ${prevShift.end_time}`,
          hoursDiff: hoursDiff.toFixed(1)
        };
      }
    }
    
    return { violates: false };
  }

  /**
   * Validate shift against all WFM rules
   */
  async validateShift(userId, groupId, shiftDate, startTime, endTime) {
    const rules = await this.getRulesForUser(userId, groupId);
    const violations = [];
    const warnings = [];

    // Calculate date boundaries
    const date = new Date(shiftDate);
    const weekStart = new Date(date.setDate(date.getDate() - date.getDay()));
    const monthStart = new Date(new Date(shiftDate).setDate(1));

    for (const rule of rules) {
      switch (rule.rule_type) {
        case 'MAX_HOURS_WEEK': {
          const currentHours = await this.getWeeklyHours(userId, weekStart);
          const newShiftHours = this._calculateShiftHours(startTime, endTime);
          if (currentHours + newShiftHours > rule.value) {
            violations.push({
              rule: rule.name,
              type: rule.rule_type,
              message: `Weekly hour limit exceeded. Current: ${currentHours}h, New shift: ${newShiftHours}h, Limit: ${rule.value}h`,
              currentValue: currentHours,
              newValue: newShiftHours,
              limit: rule.value
            });
          }
          break;
        }

        case 'MAX_HOURS_MONTH': {
          const currentHours = await this.getMonthlyHours(userId, monthStart);
          const newShiftHours = this._calculateShiftHours(startTime, endTime);
          if (currentHours + newShiftHours > rule.value) {
            violations.push({
              rule: rule.name,
              type: rule.rule_type,
              message: `Monthly hour limit exceeded. Current: ${currentHours}h, New shift: ${newShiftHours}h, Limit: ${rule.value}h`,
              currentValue: currentHours,
              newValue: newShiftHours,
              limit: rule.value
            });
          }
          break;
        }

        case 'MAX_SUNDAYS_MONTH': {
          const isSunday = new Date(shiftDate).getDay() === 0;
          if (isSunday) {
            const sundayCount = await this.getSundayCount(userId, monthStart);
            if (sundayCount >= rule.value) {
              violations.push({
                rule: rule.name,
                type: rule.rule_type,
                message: `Maximum Sundays per month reached. Current: ${sundayCount}, Limit: ${rule.value}`,
                currentValue: sundayCount,
                limit: rule.value
              });
            }
          }
          break;
        }

        case 'MIN_REST_HOURS': {
          const restCheck = await this.checkMinRestHours(userId, shiftDate, startTime, rule.value);
          if (restCheck.violates) {
            violations.push({
              rule: rule.name,
              type: rule.rule_type,
              message: restCheck.message,
              currentValue: restCheck.hoursDiff,
              limit: rule.value
            });
          }
          break;
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      warnings
    };
  }

  /**
   * Helper: Calculate shift duration in hours
   */
  _calculateShiftHours(startTime, endTime) {
    const start = new Date(`2000-01-01T${startTime}`);
    let end = new Date(`2000-01-01T${endTime}`);
    
    // Handle overnight shifts
    if (end < start) {
      end = new Date(`2000-01-02T${endTime}`);
    }
    
    return (end - start) / (1000 * 60 * 60);
  }

  /**
   * Get compensatory rest days needed
   */
  async getCompensatoryRestDays(userId, monthStart) {
    const text = `
      SELECT 
        COUNT(*) AS weekends_worked,
        COUNT(CASE WHEN EXTRACT(DOW FROM shift_date) = 0 THEN 1 END) AS sundays_worked
      FROM shifts
      WHERE user_id = $1
        AND shift_date >= $2
        AND shift_date < ($2 + INTERVAL '1 month')
        AND (EXTRACT(DOW FROM shift_date) = 0 OR EXTRACT(DOW FROM shift_date) = 6)
        AND is_active = TRUE
    `;
    const result = await query(text, [userId, monthStart]);
    return result.rows[0];
  }

  /**
   * Create new WFM rule
   */
  async create(ruleData) {
    const text = `
      INSERT INTO wfm_rules (
        name, rule_type, value, description, is_global, group_id, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [
      ruleData.name,
      ruleData.ruleType,
      ruleData.value,
      ruleData.description,
      ruleData.isGlobal || false,
      ruleData.groupId || null,
      ruleData.userId || null
    ];
    const result = await query(text, values);
    return result.rows[0];
  }

  /**
   * Update WFM rule
   */
  async update(id, ruleData) {
    const fields = [];
    const values = [];
    let index = 1;

    if (ruleData.name !== undefined) {
      fields.push(`name = $${index++}`);
      values.push(ruleData.name);
    }
    if (ruleData.value !== undefined) {
      fields.push(`value = $${index++}`);
      values.push(ruleData.value);
    }
    if (ruleData.description !== undefined) {
      fields.push(`description = $${index++}`);
      values.push(ruleData.description);
    }
    if (ruleData.isActive !== undefined) {
      fields.push(`is_active = $${index++}`);
      values.push(ruleData.isActive);
    }

    if (fields.length === 0) {
      return await this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const text = `
      UPDATE wfm_rules
      SET ${fields.join(', ')}
      WHERE id = $${index}
      RETURNING *
    `;

    const result = await query(text, values);
    return result.rows[0];
  }

  /**
   * Find rule by ID
   */
  async findById(id) {
    const text = `
      SELECT 
        r.*,
        g.name AS group_name,
        u.first_name AS user_first_name,
        u.last_name AS user_last_name
      FROM wfm_rules r
      LEFT JOIN groups g ON r.group_id = g.id
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.id = $1
    `;
    const result = await query(text, [id]);
    return result.rows[0];
  }

  /**
   * Get all rules
   */
  async findAll() {
    const text = `
      SELECT 
        r.*,
        g.name AS group_name,
        u.first_name AS user_first_name,
        u.last_name AS user_last_name
      FROM wfm_rules r
      LEFT JOIN groups g ON r.group_id = g.id
      LEFT JOIN users u ON r.user_id = u.id
      ORDER BY r.is_global DESC, r.created_at DESC
    `;
    const result = await query(text);
    return result.rows;
  }

  /**
   * Delete rule
   */
  async delete(id) {
    const text = `
      UPDATE wfm_rules
      SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const result = await query(text, [id]);
    return result.rows[0];
  }
}

module.exports = new WfmRulesDAO();
