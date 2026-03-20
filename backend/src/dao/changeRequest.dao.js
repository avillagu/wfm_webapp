/**
 * Change Request DAO - Data Access Object for shift change workflow
 */

const { query, getClient } = require('../config/database');

class ChangeRequestDAO {
  /**
   * Create new change request
   */
  async create(requestData) {
    const text = `
      INSERT INTO change_requests (
        request_type, requester_id, target_user_id, shift_id,
        target_shift_id, reason, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [
      requestData.requestType,
      requestData.requesterId,
      requestData.targetUserId || null,
      requestData.shiftId,
      requestData.targetShiftId || null,
      requestData.reason,
      requestData.status || 'PENDING'
    ];
    const result = await query(text, values);
    return result.rows[0];
  }

  /**
   * Find change request by ID
   */
  async findById(id) {
    const text = `
      SELECT 
        cr.*,
        req.first_name AS requester_first_name,
        req.last_name AS requester_last_name,
        req.employee_code AS requester_employee_code,
        tgt.first_name AS target_first_name,
        tgt.last_name AS target_last_name,
        rev.first_name AS reviewer_first_name,
        rev.last_name AS reviewer_last_name,
        s.shift_date,
        s.start_time,
        s.end_time,
        s.shift_type
      FROM change_requests cr
      JOIN users req ON cr.requester_id = req.id
      LEFT JOIN users tgt ON cr.target_user_id = tgt.id
      LEFT JOIN users rev ON cr.reviewer_id = rev.id
      JOIN shifts s ON cr.shift_id = s.id
      WHERE cr.id = $1
    `;
    const result = await query(text, [id]);
    return result.rows[0];
  }

  /**
   * Get change requests by user (as requester or target)
   */
  async findByUser(userId, status = null) {
    let text = `
      SELECT 
        cr.*,
        req.first_name AS requester_first_name,
        req.last_name AS requester_last_name,
        tgt.first_name AS target_first_name,
        tgt.last_name AS target_last_name,
        s.shift_date,
        s.start_time,
        s.end_time
      FROM change_requests cr
      JOIN users req ON cr.requester_id = req.id
      LEFT JOIN users tgt ON cr.target_user_id = tgt.id
      JOIN shifts s ON cr.shift_id = s.id
      WHERE cr.requester_id = $1 OR cr.target_user_id = $1
    `;
    
    const values = [userId];
    
    if (status) {
      text += ' AND cr.status = $2';
      values.push(status);
    }

    text += ' ORDER BY cr.created_at DESC';

    const result = await query(text, values);
    return result.rows;
  }

  /**
   * Get pending change requests for review (for supervisors/admins)
   */
  async findPendingForReview(groupId = null) {
    let text = `
      SELECT 
        cr.*,
        req.first_name AS requester_first_name,
        req.last_name AS requester_last_name,
        tgt.first_name AS target_first_name,
        tgt.last_name AS target_last_name,
        s.shift_date,
        s.start_time,
        s.end_time,
        g.name AS group_name
      FROM change_requests cr
      JOIN users req ON cr.requester_id = req.id
      LEFT JOIN users tgt ON cr.target_user_id = tgt.id
      JOIN shifts s ON cr.shift_id = s.id
      JOIN groups g ON req.group_id = g.id
      WHERE cr.status = 'PENDING'
    `;
    
    const values = [];
    
    if (groupId) {
      text += ' AND req.group_id = $1';
      values.push(groupId);
    }

    text += ' ORDER BY cr.created_at DESC';

    const result = await query(text, values);
    return result.rows;
  }

  /**
   * Update target response (for shift swaps)
   */
  async updateTargetResponse(id, response, reviewerNotes = null) {
    const text = `
      UPDATE change_requests
      SET 
        target_response = $1,
        target_response_at = CURRENT_TIMESTAMP,
        reviewer_response = COALESCE($2, reviewer_response),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
    const result = await query(text, [response, reviewerNotes, id]);
    return result.rows[0];
  }

  /**
   * Final approval/rejection by supervisor/admin
   */
  async finalizeReview(id, reviewerId, approved, reviewerResponse = null) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Update change request status
      const updateText = `
        UPDATE change_requests
        SET 
          status = $1,
          reviewer_id = $2,
          reviewer_response = $3,
          reviewed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *
      `;
      const status = approved ? 'APPROVED' : 'REJECTED';
      const updateResult = await client.query(updateText, [status, reviewerId, reviewerResponse, id]);

      // If approved and it's a swap, execute the shift exchange
      if (approved) {
        const cr = updateResult.rows[0];
        
        if (cr.request_type === 'SHIFT_SWAP' && cr.target_shift_id) {
          // Swap the user_ids of the two shifts
          const swapText = `
            UPDATE shifts
            SET user_id = CASE 
              WHEN id = $1 THEN $2
              WHEN id = $3 THEN $4
            END,
            updated_at = CURRENT_TIMESTAMP
            WHERE id IN ($1, $3)
          `;
          await client.query(swapText, [
            cr.shift_id,
            cr.target_user_id,
            cr.target_shift_id,
            cr.requester_id
          ]);
        } else if (cr.request_type === 'REST_DAY_REQUEST') {
          // For rest day requests, deactivate the shift
          const deactivateText = `
            UPDATE shifts
            SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `;
          await client.query(deactivateText, [cr.shift_id]);
        }
      }

      await client.query('COMMIT');
      return updateResult.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel change request (by requester)
   */
  async cancel(id) {
    const text = `
      UPDATE change_requests
      SET 
        status = 'CANCELLED',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const result = await query(text, [id]);
    return result.rows[0];
  }

  /**
   * Get change request statistics
   */
  async getStatistics(groupId = null) {
    let text = `
      SELECT 
        COUNT(*) AS total,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) AS pending,
        COUNT(CASE WHEN status = 'APPROVED' THEN 1 END) AS approved,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) AS rejected,
        COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) AS cancelled
      FROM change_requests cr
      JOIN users u ON cr.requester_id = u.id
      WHERE 1=1
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

module.exports = new ChangeRequestDAO();
