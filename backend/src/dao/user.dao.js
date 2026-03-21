/**
 * User DAO - Data Access Object for users table
 * All queries use parameterized statements for SQL injection immunity
 */

const { query, getClient } = require('../config/database');

class UserDAO {
  /**
   * Find user by username
   */
  async findByUsername(username) {
    const text = `
      SELECT 
        u.id,
        u.username,
        u.email,
        u.password_hash,
        u.first_name,
        u.last_name,
        u.employee_code,
        u.role_id,
        u.group_id,
        u.is_active,
        u.last_login,
        r.name AS role_name,
        g.name AS group_name,
        g.code AS group_code
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN groups g ON u.group_id = g.id
      WHERE u.username = $1
    `;
    const result = await query(text, [username]);
    return result.rows[0];
  }

  /**
   * Find user by ID
   */
  async findById(id) {
    const text = `
      SELECT
        u.id,
        u.username,
        u.email,
        u.first_name,
        u.last_name,
        u.employee_code,
        u.role_id,
        u.group_id,
        u.is_active,
        u.last_login,
        u.current_activity,
        u.activity_updated_at,
        u.activity_start_time,
        r.name AS role_name,
        g.name AS group_name,
        g.code AS group_code
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN groups g ON u.group_id = g.id
      WHERE u.id = $1
    `;
    const result = await query(text, [id]);
    return result.rows[0];
  }

  /**
   * Get user permissions
   */
  async getUserPermissions(userId) {
    const text = `
      SELECT DISTINCT p.name AS permission, p.resource, p.action
      FROM users u
      JOIN role_permissions rp ON u.role_id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE u.id = $1
    `;
    const result = await query(text, [userId]);
    return result.rows;
  }

  /**
   * Create new user
   */
  async create(userData) {
    const text = `
      INSERT INTO users (
        username, email, password_hash, first_name, last_name,
        employee_code, role_id, group_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, username, email, first_name, last_name, employee_code, role_id, group_id
    `;
    const values = [
      userData.username,
      userData.email,
      userData.passwordHash,
      userData.firstName,
      userData.lastName,
      userData.employeeCode,
      userData.roleId,
      userData.groupId || null
    ];
    const result = await query(text, values);
    return result.rows[0];
  }

  /**
   * Update user
   */
  async update(id, userData) {
    const fields = [];
    const values = [];
    let index = 1;

    if (userData.email !== undefined) {
      fields.push(`email = $${index++}`);
      values.push(userData.email);
    }
    if (userData.firstName !== undefined) {
      fields.push(`first_name = $${index++}`);
      values.push(userData.firstName);
    }
    if (userData.lastName !== undefined) {
      fields.push(`last_name = $${index++}`);
      values.push(userData.lastName);
    }
    if (userData.roleId !== undefined) {
      fields.push(`role_id = $${index++}`);
      values.push(userData.roleId);
    }
    if (userData.groupId !== undefined) {
      fields.push(`group_id = $${index++}`);
      values.push(userData.groupId);
    }
    if (userData.isActive !== undefined) {
      fields.push(`is_active = $${index++}`);
      values.push(userData.isActive);
    }

    if (fields.length === 0) {
      return await this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const text = `
      UPDATE users
      SET ${fields.join(', ')}
      WHERE id = $${index}
      RETURNING id, username, email, first_name, last_name, employee_code, role_id, group_id, is_active
    `;

    const result = await query(text, values);
    return result.rows[0];
  }

  /**
   * Update user activity status
   */
  async updateActivity(id, activity) {
    const text = `
      UPDATE users
      SET current_activity = $1, 
          activity_updated_at = CURRENT_TIMESTAMP,
          activity_start_time = CASE 
            WHEN current_activity IS DISTINCT FROM $1 THEN CURRENT_TIMESTAMP 
            ELSE activity_start_time 
          END
      WHERE id = $2
      RETURNING id, username, current_activity, activity_updated_at, activity_start_time
    `;
    const result = await query(text, [activity, id]);
    return result.rows[0];
  }

  /**
   * Update password
   */
  async updatePassword(id, passwordHash) {
    const text = `
      UPDATE users
      SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, username
    `;
    const result = await query(text, [passwordHash, id]);
    return result.rows[0];
  }

  /**
   * Update last login
   */
  async updateLastLogin(id) {
    const text = `
      UPDATE users
      SET last_login = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    await query(text, [id]);
  }

  /**
   * Get all users with pagination
   */
  async findAll(page = 1, limit = 20, filters = {}) {
    let text = `
      SELECT
        u.id,
        u.username,
        u.email,
        u.first_name,
        u.last_name,
        u.employee_code,
        u.role_id,
        u.group_id,
        u.is_active,
        u.last_login,
        u.current_activity,
        u.activity_updated_at,
        u.activity_start_time,
        r.name AS role_name,
        g.name AS group_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN groups g ON u.group_id = g.id
      WHERE 1=1
    `;

    const values = [];
    let index = 1;

    if (filters.groupId) {
      text += ` AND u.group_id = $${index++}`;
      values.push(filters.groupId);
    }

    if (filters.roleId) {
      text += ` AND u.role_id = $${index++}`;
      values.push(filters.roleId);
    }

    if (filters.isActive !== undefined) {
      text += ` AND u.is_active = $${index++}`;
      values.push(filters.isActive);
    }

    if (filters.search) {
      text += ` AND (u.first_name ILIKE $${index} OR u.last_name ILIKE $${index} OR u.username ILIKE $${index})`;
      values.push(`%${filters.search}%`);
      index++;
    }

    const offset = (page - 1) * limit;
    text += ` ORDER BY u.created_at DESC LIMIT $${index++} OFFSET $${index++}`;
    values.push(limit, offset);

    const result = await query(text, values);
    return result.rows;
  }

  /**
   * Count users
   */
  async count(filters = {}) {
    let text = 'SELECT COUNT(*) FROM users WHERE 1=1';
    const values = [];
    let index = 1;

    if (filters.groupId) {
      text += ` AND group_id = $${index++}`;
      values.push(filters.groupId);
    }

    if (filters.isActive !== undefined) {
      text += ` AND is_active = $${index++}`;
      values.push(filters.isActive);
    }

    const result = await query(text, values);
    return parseInt(result.rows[0].count);
  }

  /**
   * Delete user (soft delete by deactivating)
   */
  async delete(id) {
    const text = `
      UPDATE users
      SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, username
    `;
    const result = await query(text, [id]);
    return result.rows[0];
  }

  /**
   * Get users by group ID
   */
  async findByGroupId(groupId) {
    const text = `
      SELECT
        u.id,
        u.username,
        u.first_name,
        u.last_name,
        u.employee_code,
        r.name AS role_name,
        u.current_activity,
        u.activity_updated_at,
        u.activity_start_time,
        g.name AS group_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN groups g ON u.group_id = g.id
      WHERE u.group_id = $1 AND u.is_active = TRUE
      ORDER BY u.last_name, u.first_name
    `;
    const result = await query(text, [groupId]);
    return result.rows;
  }
}

module.exports = new UserDAO();
