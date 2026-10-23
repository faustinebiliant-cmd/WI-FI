// ============================================================
// OSWAGOTech WiFi - Server
// ============================================================

// Env must load first. config/env.js runs every boot check and
// exits the process on misconfiguration. Nothing below this
// require may run if the environment is invalid.
const env = require('./config/env');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const db = require('./config/db'); // Import DB directly

// ------------------------------------------------------------
// App
// ------------------------------------------------------------
const app = express();

// Behind Nginx on the VPS. Trust exactly one proxy hop so
// rate limiters see the real client IP.
app.set('trust proxy', 1);

// ------------------------------------------------------------
// Security headers
// ------------------------------------------------------------
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// ------------------------------------------------------------
// CORS
// ------------------------------------------------------------
app.use(cors({
  origin: (origin, callback) => {
    // Requests with no Origin header (curl, server-to-server)
    // are allowed. They carry no cookies and no ambient auth.
    if (!origin) return callback(null, true);

    if (env.ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    // In development, log the rejection so a mis-typed port
    // is obvious. Never echo the origin back to the caller.
    if (env.IS_DEV) {
      console.warn('CORS blocked origin:', origin);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id'],
  maxAge: 86400
}));

// ------------------------------------------------------------
// Parsing and logging
// ------------------------------------------------------------
app.use(morgan(env.IS_PROD ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ------------------------------------------------------------
// Health Check (Updated for Postgres)
// ------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  try {
    // A tiny query to prove the DB connection works
    await db.query('SELECT id FROM tenants LIMIT 1');

    res.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: err.message || 'Database table not found'
    });
  }
});

// ------------------------------------------------------------
// Routes will be mounted here in Week 1 as each module lands.
// ------------------------------------------------------------
const authPlatformRoutes = require('./routes/authPlatform');
app.use('/api/auth/platform', authPlatformRoutes);

// Platform Tenant Management
const platformTenantRoutes = require('./routes/platformTenant');
app.use('/api/platform/tenants', platformTenantRoutes);

// Platform Monitoring (Routers, Sessions, Audit)
const platformMonitorRoutes = require('./routes/platformMonitor');
app.use('/api/platform', platformMonitorRoutes);

const tenantRoutes = require('./routes/tenant');
app.use('/api/tenant', tenantRoutes);

const portalRoutes = require('./routes/portal');
app.use('/api/portal', portalRoutes);

// ------------------------------------------------------------
// 404
// ------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// ------------------------------------------------------------
// Error handler
// ------------------------------------------------------------
// Dev: surface err.message so local debugging is not blind.
// Prod: generic message. Never leak internals.
//
// Do not log req.body or req.params here. Portal requests
// carry MAC and IP in the body. Those are personal data.
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);

  if (env.IS_PROD) {
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }

  return res.status(500).json({
    success: false,
    error: err.message
  });
});

// ------------------------------------------------------------
// Start the Router Pinger (runs every 5 minutes)
// ------------------------------------------------------------
const { exec } = require('child_process');
setInterval(() => {
  exec('node scripts/pingRouters.js', (err, stdout, stderr) => {
    if (err) console.error('Pinger error:', err.message);
    if (stdout) console.log(stdout.trim());
  });
}, 5 * 60 * 1000); // 5 minutes

// Start the session expiration checker
const { startSessionCleaner } = require('./services/sessionCleaner');
startSessionCleaner();

// ------------------------------------------------------------
// Start
// ------------------------------------------------------------
app.listen(env.PORT, () => {
  console.log('========================================');
  console.log('   OSWAGOTECH WIFI');
  console.log('========================================');
  console.log(`   Server:      http://localhost:${env.PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   Router mode: ${env.ROUTER_MODE}`);
  console.log('========================================');
});