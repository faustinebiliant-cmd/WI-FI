// ============================================================
// Oswagolink - Server
// ============================================================

// Env must load first. config/env.js runs every boot check and
// exits the process on misconfiguration. Nothing below this
// require may run if the environment is invalid.
const env = require('./config/env');

const path = require('path');
const { execFile } = require('child_process');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const db = require('./config/db');

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
    // Requests with no Origin header (curl, routers, server-to-server)
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
  // The panels send their login as a token (Authorization header), never as a cookie
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));

// ------------------------------------------------------------
// Parsing and logging
// ------------------------------------------------------------
// Setup tokens and keys are secrets: keep them out of the log file
morgan.token('safe-url', (req) =>
  String(req.originalUrl || req.url)
    .replace(/(\/api\/provision\/[A-Za-z]+\/)[^/?]+/, '$1***')
    .replace(/([?&]pubkey=)[^&]*/, '$1***')
);
const accessLogFormat = env.IS_PROD
  ? ':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
  : ':method :safe-url :status :response-time ms';
app.use(morgan(accessLogFormat));
// The biggest real request is under 1 KB: 32 KB is plenty, and nobody can make the
// server read megabytes of nothing
app.use(express.json({ limit: '32kb' }));

// API answers hold private data (customers, phone numbers, voucher codes): no browser
// or proxy may keep a copy, so the next person on a shared computer cannot see them
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ------------------------------------------------------------
// Health check (public): is the database reachable?
// ------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');

    res.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    // Details go to the log only; this page is public
    console.error('Health check failed:', err.message);
    res.status(500).json({
      status: 'error',
      database: 'disconnected'
    });
  }
});

// ------------------------------------------------------------
// Routes
// ------------------------------------------------------------
// The admin API answers only on the admin address (env.ADMIN_HOST), where Nginx
// checks the device passes; on oswagolink.co.tz it does not exist. The Host header
// is used, not req.hostname: with "trust proxy" req.hostname would believe a
// visitor's own X-Forwarded-Host header.
const adminHostOnly = (req, res, next) => {
  if (!env.ADMIN_HOST) return next();
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  if (host === env.ADMIN_HOST) return next();
  return res.status(404).json({ success: false, error: 'Not found' });
};

const authPlatformRoutes = require('./routes/authPlatform');
app.use('/api/auth/platform', adminHostOnly, authPlatformRoutes);

// Platform Tenant Management
const platformTenantRoutes = require('./routes/platformTenant');
app.use('/api/platform/tenants', adminHostOnly, platformTenantRoutes);

// Platform Monitoring (Routers, Sessions, Audit)
const platformMonitorRoutes = require('./routes/platformMonitor');
app.use('/api/platform', adminHostOnly, platformMonitorRoutes);

const tenantRoutes = require('./routes/tenant');
app.use('/api/tenant', tenantRoutes);

const portalRoutes = require('./routes/portal');
app.use('/api/portal', portalRoutes);

const provisionRoutes = require('./routes/provision');
app.use('/api/provision', provisionRoutes);

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
  // If a reply has already started, let Express close the connection
  if (res.headersSent) return next(err);

  // The visitor's mistake, not ours (broken JSON, a body over 1 MB): say so, and
  // keep it out of the error log
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({
      success: false,
      error: err.status === 413 ? 'Request too large' : 'Bad request'
    });
  }

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
// Background scripts: each runs as its own small process, and a
// second copy never starts while one is still running.
// ------------------------------------------------------------
const runningScripts = new Set();
const runScript = (file, timeoutMs, label) => {
  if (runningScripts.has(file)) return;
  runningScripts.add(file);
  execFile(
    process.execPath,
    [path.join(__dirname, 'scripts', file)],
    { timeout: timeoutMs, cwd: __dirname },
    (err, stdout, stderr) => {
      runningScripts.delete(file);
      if (err) console.error(`${label} error:`, err.message);
      if (stdout) console.log(stdout.trim());
      if (stderr) console.error(stderr.trim());
    }
  );
};

// Router pinger: at start-up, then every 5 minutes. 4.5 minutes is enough for
// hundreds of routers, and still finished before the next run.
const runPinger = () => runScript('pingRouters.js', 270000, 'Pinger');
runPinger();
const pingerInterval = setInterval(runPinger, 5 * 60 * 1000);

// History clean-up: deletes history older than 1 month. Every night at 02:00
// Tanzania time (23:00 UTC), one hour before the database backup, and once
// 2 minutes after start-up.
const runHistoryCleanup = () => runScript('deleteOldHistory.js', 30 * 60 * 1000, 'History clean-up');
const historyStartTimer = setTimeout(runHistoryCleanup, 2 * 60 * 1000);
// Checked every hour, so it runs exactly once during the 23:00 UTC hour
const historyInterval = setInterval(() => {
  if (new Date().getUTCHours() === 23) runHistoryCleanup();
}, 60 * 60 * 1000);

// Session cleaner: expires vouchers and clears stale sessions
const { startSessionCleaner } = require('./services/sessionCleaner');

// ------------------------------------------------------------
// Start Server
// ------------------------------------------------------------
// Only reachable from inside this machine: the public reaches the API through Nginx
// (proxy_pass http://127.0.0.1:5001), never on port 5001 directly, even if the firewall changes.
const LISTEN_HOST = '127.0.0.1';
const server = app.listen(env.PORT, LISTEN_HOST, () => {
  console.log('========================================');
  console.log('   OSWAGOLINK');
  console.log('========================================');
  console.log(`   Server:      http://${LISTEN_HOST}:${env.PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   Router mode: ${env.ROUTER_MODE}`);
  console.log('========================================');
});

// Start the cleaner now that the server is running
const stopSessionCleaner = startSessionCleaner();

// ------------------------------------------------------------
// Graceful shutdown
// ------------------------------------------------------------
const gracefulShutdown = (signal) => {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

  // 1. Stop accepting new requests
  server.close(() => {
    console.log('HTTP server closed.');

    // 2. Stop background tasks
    clearInterval(pingerInterval);
    clearInterval(historyInterval);
    clearTimeout(historyStartTimer);
    stopSessionCleaner();
    console.log('Background tasks stopped.');

    // 3. Close database connection
    db.pool.end(() => {
      console.log('Database connection closed.');
      console.log('Shutdown complete. Exiting.');
      process.exit(0);
    });
  });

  // Force exit after 10 seconds if something hangs
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Listen for PM2 or ctrl+c signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Last safety net: a failed request that nobody caught is logged,
// it must never take the whole server down for every business
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled error (server kept running):', reason && reason.message ? reason.message : reason);
});

// The router library can throw from inside its network code, where no try/catch
// reaches (like the old "!empty" crash). That only breaks one router connection, and
// our time limits close it, so the server keeps running for everybody else.
// Any other unexpected error: logged, then a clean exit, and PM2 starts a fresh copy.
process.on('uncaughtException', (err) => {
  const fromRouterLibrary =
    (err && err.name === 'RosException') || String((err && err.stack) || '').includes('node-routeros');
  if (fromRouterLibrary) {
    console.error('Router connection error (server kept running):', err.message || err);
    return;
  }
  console.error('Unexpected crash, restarting:', (err && err.stack) || err);
  process.exit(1);
});