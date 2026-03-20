/**
 * Group Controller
 * Group management endpoints
 */

const { query } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Get all groups
 * GET /api/groups
 */
const getAllGroups = asyncHandler(async (req, res) => {
  const text = `
    SELECT 
      g.*,
      COUNT(u.id) AS user_count
    FROM groups g
    LEFT JOIN users u ON g.id = u.group_id AND u.is_active = TRUE
    WHERE g.is_active = TRUE
    GROUP BY g.id
    ORDER BY g.name
  `;
  const result = await query(text);
  res.json(result.rows);
});

/**
 * Get group by ID
 * GET /api/groups/:id
 */
const getGroupById = asyncHandler(async (req, res) => {
  const text = `
    SELECT 
      g.*,
      COUNT(u.id) AS user_count
    FROM groups g
    LEFT JOIN users u ON g.id = u.group_id AND u.is_active = TRUE
    WHERE g.id = $1 AND g.is_active = TRUE
    GROUP BY g.id
  `;
  const result = await query(text, [req.params.id]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({
      error: 'Group not found',
      code: 'GROUP_NOT_FOUND'
    });
  }

  res.json(result.rows[0]);
});

/**
 * Create new group
 * POST /api/groups
 */
const createGroup = asyncHandler(async (req, res) => {
  const { name, code, description } = req.body;

  const text = `
    INSERT INTO groups (name, code, description)
    VALUES ($1, $2, $3)
    RETURNING *
  `;
  const result = await query(text, [name, code, description || null]);
  
  res.status(201).json({
    message: 'Group created successfully',
    group: result.rows[0]
  });
});

/**
 * Update group
 * PUT /api/groups/:id
 */
const updateGroup = asyncHandler(async (req, res) => {
  const { name, code, description, isActive } = req.body;

  const text = `
    UPDATE groups
    SET 
      name = COALESCE($1, name),
      code = COALESCE($2, code),
      description = COALESCE($3, description),
      is_active = COALESCE($4, is_active),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $5
    RETURNING *
  `;
  const result = await query(text, [name, code, description, isActive, req.params.id]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({
      error: 'Group not found',
      code: 'GROUP_NOT_FOUND'
    });
  }

  res.json({
    message: 'Group updated successfully',
    group: result.rows[0]
  });
});

/**
 * Delete group (soft delete)
 * DELETE /api/groups/:id
 */
const deleteGroup = asyncHandler(async (req, res) => {
  const text = `
    UPDATE groups
    SET 
      is_active = FALSE,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `;
  const result = await query(text, [req.params.id]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({
      error: 'Group not found',
      code: 'GROUP_NOT_FOUND'
    });
  }

  res.json({
    message: 'Group deleted successfully',
    group: result.rows[0]
  });
});

module.exports = {
  getAllGroups,
  getGroupById,
  createGroup,
  updateGroup,
  deleteGroup
};
