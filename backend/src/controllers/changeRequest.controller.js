/**
 * Change Request Controller
 * 3-step approval workflow for shift changes
 */

const changeRequestDAO = require('../dao/changeRequest.dao');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateChangeRequest } = require('../middleware/validation');
const { emitToUser, emitToRole } = require('../services/socket.service');

/**
 * Create change request
 * POST /api/change-requests
 */
const createChangeRequest = [
  validateChangeRequest,
  asyncHandler(async (req, res) => {
    const { requestType, targetUserId, shiftId, targetShiftId, reason } = req.body;

    // Create request
    const request = await changeRequestDAO.create({
      requestType,
      requesterId: req.user.id,
      targetUserId,
      shiftId,
      targetShiftId,
      reason,
      status: 'PENDING'
    });

    // Emit socket notifications
    if (targetUserId) {
      emitToUser(req.io, targetUserId, 'changeRequest:notification', {
        type: 'SWAP_REQUEST',
        message: `${req.user.username} requested a shift swap`,
        requestId: request.id
      });
    }

    // Notify supervisors
    emitToRole(req.io, 'ADMIN', 'changeRequest:pending', {
      requestId: request.id,
      type: requestType,
      requesterId: req.user.id
    });
    emitToRole(req.io, 'SUPERVISOR', 'changeRequest:pending', {
      requestId: request.id,
      type: requestType,
      requesterId: req.user.id
    });

    res.status(201).json({
      message: 'Change request created',
      request
    });
  })
];

/**
 * Get change requests for current user
 * GET /api/change-requests/my-requests?status=X
 */
const getMyRequests = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const requests = await changeRequestDAO.findByUser(req.user.id, status);
  res.json(requests);
});

/**
 * Get pending requests for review (supervisors/admins)
 * GET /api/change-requests/pending-review?groupId=X
 */
const getPendingReview = asyncHandler(async (req, res) => {
  const groupId = req.query.groupId || req.user.accessibleGroupId;
  const requests = await changeRequestDAO.findPendingForReview(groupId);
  res.json(requests);
});

/**
 * Get change request by ID
 * GET /api/change-requests/:id
 */
const getRequestById = asyncHandler(async (req, res) => {
  const request = await changeRequestDAO.findById(req.params.id);

  if (!request) {
    return res.status(404).json({
      error: 'Request not found',
      code: 'REQUEST_NOT_FOUND'
    });
  }

  // Check access
  const isRequester = request.requester_id === req.user.id;
  const isTarget = request.target_user_id === req.user.id;
  const isSupervisor = ['ADMIN', 'SUPERVISOR'].includes(req.user.roleName);

  if (!isRequester && !isTarget && !isSupervisor) {
    return res.status(403).json({
      error: 'Access denied',
      code: 'FORBIDDEN'
    });
  }

  res.json(request);
});

/**
 * Target user responds to swap request
 * POST /api/change-requests/:id/target-response
 */
const targetResponse = asyncHandler(async (req, res) => {
  const { response, notes } = req.body; // ACCEPTED or REJECTED

  if (!['ACCEPTED', 'REJECTED'].includes(response)) {
    return res.status(400).json({
      error: 'Response must be ACCEPTED or REJECTED',
      code: 'VALIDATION_ERROR'
    });
  }

  const request = await changeRequestDAO.findById(req.params.id);

  if (!request) {
    return res.status(404).json({
      error: 'Request not found',
      code: 'REQUEST_NOT_FOUND'
    });
  }

  // Verify current user is the target
  if (request.target_user_id !== req.user.id) {
    return res.status(403).json({
      error: 'You are not the target of this request',
      code: 'FORBIDDEN'
    });
  }

  if (request.status !== 'PENDING') {
    return res.status(400).json({
      error: `Request is already ${request.status}`,
      code: 'INVALID_STATUS'
    });
  }

  // Update target response
  const updated = await changeRequestDAO.updateTargetResponse(
    req.params.id,
    response,
    notes
  );

  // Notify requester
  emitToUser(req.io, request.requester_id, 'changeRequest:notification', {
    type: 'TARGET_RESPONSE',
    message: `Your shift ${response.toLowerCase() === 'accepted' ? 'swap was accepted' : 'swap was declined'}`,
    requestId: req.params.id
  });

  // If rejected, notify supervisors it's closed
  if (response === 'REJECTED') {
    emitToRole(req.io, 'ADMIN', 'changeRequest:closed', {
      requestId: req.params.id,
      reason: 'Target rejected'
    });
  }

  res.json({
    message: `Response recorded: ${response}`,
    request: updated
  });
});

/**
 * Supervisor/Admin final approval
 * POST /api/change-requests/:id/review
 */
const finalReview = asyncHandler(async (req, res) => {
  const { approved, notes } = req.body;

  if (typeof approved !== 'boolean') {
    return res.status(400).json({
      error: 'approved must be true or false',
      code: 'VALIDATION_ERROR'
    });
  }

  const request = await changeRequestDAO.findById(req.params.id);

  if (!request) {
    return res.status(404).json({
      error: 'Request not found',
      code: 'REQUEST_NOT_FOUND'
    });
  }

  // For swaps, check target has responded
  if (request.request_type === 'SHIFT_SWAP' && !request.target_response) {
    return res.status(400).json({
      error: 'Target user must respond before final approval',
      code: 'PENDING_TARGET_RESPONSE'
    });
  }

  // Finalize review
  const updated = await changeRequestDAO.finalizeReview(
    req.params.id,
    req.user.id,
    approved,
    notes
  );

  // Notify relevant parties
  emitToUser(req.io, request.requester_id, 'changeRequest:notification', {
    type: 'FINAL_DECISION',
    message: `Your request was ${approved ? 'approved' : 'rejected'} by ${req.user.username}`,
    requestId: req.params.id
  });

  if (request.target_user_id) {
    emitToUser(req.io, request.target_user_id, 'changeRequest:notification', {
      type: 'FINAL_DECISION',
      message: `Shift swap was ${approved ? 'approved' : 'rejected'}`,
      requestId: req.params.id
    });
  }

  res.json({
    message: `Request ${approved ? 'approved' : 'rejected'}`,
    request: updated
  });
});

/**
 * Cancel change request (by requester)
 * DELETE /api/change-requests/:id
 */
const cancelRequest = asyncHandler(async (req, res) => {
  const request = await changeRequestDAO.findById(req.params.id);

  if (!request) {
    return res.status(404).json({
      error: 'Request not found',
      code: 'REQUEST_NOT_FOUND'
    });
  }

  // Only requester can cancel
  if (request.requester_id !== req.user.id) {
    return res.status(403).json({
      error: 'Only requester can cancel',
      code: 'FORBIDDEN'
    });
  }

  if (request.status !== 'PENDING') {
    return res.status(400).json({
      error: `Cannot cancel ${request.status} request`,
      code: 'INVALID_STATUS'
    });
  }

  const updated = await changeRequestDAO.cancel(req.params.id);

  // Notify target if applicable
  if (request.target_user_id) {
    emitToUser(req.io, request.target_user_id, 'changeRequest:notification', {
      type: 'REQUEST_CANCELLED',
      message: 'Shift swap request was cancelled',
      requestId: req.params.id
    });
  }

  res.json({
    message: 'Request cancelled',
    request: updated
  });
});

/**
 * Get change request statistics
 * GET /api/change-requests/stats?groupId=X
 */
const getStats = asyncHandler(async (req, res) => {
  const groupId = req.query.groupId || req.user.accessibleGroupId;
  const stats = await changeRequestDAO.getStatistics(groupId);
  res.json(stats);
});

module.exports = {
  createChangeRequest,
  getMyRequests,
  getPendingReview,
  getRequestById,
  targetResponse,
  finalReview,
  cancelRequest,
  getStats
};
