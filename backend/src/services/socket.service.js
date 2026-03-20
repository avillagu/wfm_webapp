/**
 * Socket.IO Service
 * Real-time bidirectional communication for calendar updates and notifications
 */

const jwt = require('jsonwebtoken');
const userDAO = require('../dao/user.dao');

// Store connected users by socket ID
const connectedUsers = new Map();

/**
 * Setup Socket.IO with authentication and event handlers
 */
const setupSocketIO = (io) => {
  // Authentication middleware for sockets
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await userDAO.findById(decoded.userId);

      if (!user || !user.is_active) {
        return next(new Error('User not found or inactive'));
      }

      // Attach user to socket
      socket.user = {
        id: user.id,
        username: user.username,
        roleId: user.role_id,
        roleName: user.role_name,
        groupId: user.group_id
      };

      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id} - User: ${socket.user.username}`);

    // Join user's group room
    if (socket.user.groupId) {
      socket.join(`group:${socket.user.groupId}`);
      console.log(`User ${socket.user.username} joined group room: ${socket.user.groupId}`);
    }

    // Join role-based room
    socket.join(`role:${socket.user.roleName}`);

    // Store connection
    connectedUsers.set(socket.id, socket.user);

    // Broadcast user online status (for admins/supervisors)
    io.to('role:ADMIN', 'role:SUPERVISOR').emit('user:online', {
      userId: socket.user.id,
      username: socket.user.username,
      online: true
    });

    // Handle shift update events
    socket.on('shift:update', (data) => {
      // Validate user has permission
      if (!['ADMIN', 'SUPERVISOR'].includes(socket.user.roleName)) {
        socket.emit('error', { message: 'No permission to update shifts' });
        return;
      }

      // Broadcast to all users in the group
      io.to(`group:${data.groupId}`).emit('shift:updated', {
        shiftId: data.shiftId,
        action: data.action, // 'created', 'updated', 'deleted'
        shift: data.shift,
        updatedBy: socket.user.username,
        timestamp: new Date().toISOString()
      });
    });

    // Handle punch events
    socket.on('punch:action', (data) => {
      // Broadcast to group and supervisors
      const rooms = [`group:${socket.user.groupId}`];
      if (['ADMIN', 'SUPERVISOR'].includes(socket.user.roleName)) {
        rooms.push('role:ADMIN', 'role:SUPERVISOR');
      }

      io.to(rooms).emit('punch:updated', {
        userId: socket.user.id,
        action: data.action, // 'clock_in', 'clock_out'
        timestamp: new Date().toISOString(),
        username: socket.user.username
      });
    });

    // Handle change request events
    socket.on('changeRequest:action', (data) => {
      // Notify relevant parties
      if (data.targetUserId) {
        // Find socket of target user and notify
        for (const [socketId, user] of connectedUsers.entries()) {
          if (user.id === data.targetUserId) {
            io.to(socketId).emit('changeRequest:notification', {
              type: data.type,
              message: data.message,
              timestamp: new Date().toISOString()
            });
          }
        }
      }

      // Notify supervisors/admins
      io.to('role:ADMIN', 'role:SUPERVISOR').emit('changeRequest:pending', {
        requestId: data.requestId,
        type: data.type,
        requesterId: socket.user.id,
        timestamp: new Date().toISOString()
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      
      const user = connectedUsers.get(socket.id);
      if (user) {
        connectedUsers.delete(socket.id);
        
        // Broadcast user offline status
        io.to('role:ADMIN', 'role:SUPERVISOR').emit('user:online', {
          userId: user.id,
          username: user.username,
          online: false
        });
      }
    });

    // Handle errors
    socket.on('error', (err) => {
      console.error(`Socket error for ${socket.id}:`, err);
    });
  });

  // Graceful shutdown handler
  process.on('SIGTERM', () => {
    io.emit('server:shutdown', {
      message: 'Server is shutting down',
      timestamp: new Date().toISOString()
    });
  });

  console.log('Socket.IO service initialized');
};

/**
 * Emit event to specific user
 */
const emitToUser = (io, userId, event, data) => {
  for (const [socketId, user] of connectedUsers.entries()) {
    if (user.id === userId) {
      io.to(socketId).emit(event, data);
      return true;
    }
  }
  return false;
};

/**
 * Emit event to all users in a group
 */
const emitToGroup = (io, groupId, event, data) => {
  io.to(`group:${groupId}`).emit(event, data);
};

/**
 * Emit event to all users with specific role
 */
const emitToRole = (io, roleName, event, data) => {
  io.to(`role:${roleName}`).emit(event, data);
};

/**
 * Get count of connected users
 */
const getConnectedCount = () => {
  return connectedUsers.size;
};

/**
 * Get connected users by group
 */
const getConnectedByGroup = (groupId) => {
  return Array.from(connectedUsers.values()).filter(u => u.groupId === groupId);
};

module.exports = {
  setupSocketIO,
  emitToUser,
  emitToGroup,
  emitToRole,
  getConnectedCount,
  getConnectedByGroup
};
