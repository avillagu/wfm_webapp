/**
 * MAPO WFM WebApp - Main Server Entry Point
 * Express + Socket.IO + Native PostgreSQL
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { pool } = require('./config/database');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const groupRoutes = require('./routes/group.routes');
const shiftRoutes = require('./routes/shift.routes');
const punchRoutes = require('./routes/punch.routes');
const changeRequestRoutes = require('./routes/changeRequest.routes');
const ruleRoutes = require('./routes/rule.routes');
const reportRoutes = require('./routes/report.routes');
const { setupSocketIO } = require('./services/socket.service');
const { errorHandler } = require('./middleware/errorHandler');
const { setupDocs } = require('./config/swagger');

const app = express();
const server = http.createServer(app);

// Configuration
const PORT = process.env.PORT || 3000;
let CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:4200';

// Handle common mistakes like missing https
const allowedOrigins = [CORS_ORIGIN];
if (CORS_ORIGIN.startsWith('http')) {
  allowedOrigins.push(CORS_ORIGIN.replace(/^https?:\/\//, ''));
} else {
  allowedOrigins.push(`https://${CORS_ORIGIN}`);
  allowedOrigins.push(`http://${CORS_ORIGIN}`);
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.some(o => origin.endsWith(o))) {
      callback(null, true);
    } else {
      console.warn('CORS Blocked for origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 10000,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.SOCKET_CORS_ORIGIN || CORS_ORIGIN,
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

setupSocketIO(io);

// Middleware to attach io to req (THIS WAS MISSING!)
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Setup Swagger
setupDocs(app);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/punches', punchRoutes);
app.use('/api/change-requests', changeRequestRoutes);
app.use('/api/rules', ruleRoutes);
app.use('/api/reports', reportRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    console.log('HTTP server closed');
    try {
      await pool.end();
      console.log('Database pool closed');
      process.exit(0);
    } catch (err) {
      console.error('Error closing database pool:', err);
      process.exit(1);
    }
  });
  setTimeout(() => {
    console.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║           MAPO WFM Backend Server                      ║
╠════════════════════════════════════════════════════════╣
║  Environment: ${process.env.NODE_ENV || 'development'}                            
║  Port: ${PORT}                                        
║  CORS Origin: ${CORS_ORIGIN}                  
║  Database: Connected to PostgreSQL                    
║  Socket.IO: Enabled                                   
╚════════════════════════════════════════════════════════╝
  `);
});

module.exports = { app, server, io };
