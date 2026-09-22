const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Load environment variables. `quiet` because dotenv 17+ otherwise prints an
// "injected env (0) from .env" banner on every boot, and there is no .env
// here -- Compose passes the environment directly.
dotenv.config({ quiet: true });

// Import routes
const uploadRoutes = require('./routes/upload');
const compressionRoutes = require('./routes/compression');
const conversionRoutes = require('./routes/conversion');
const mergeRoutes = require('./routes/merge');

// Import utilities
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Create Express app
const app = express();

// Set security-related middleware
app.use(helmet());

// nginx serves the app and proxies /api on the same origin, so the browser
// never makes a cross-origin call and no CORS headers are needed. The default
// `cors()` answered every origin with `Access-Control-Allow-Origin: *`, which
// let any page on the internet drive this service from a LAN user's browser.
// CORS_ORIGIN opts specific origins back in, comma-separated, for anything
// that genuinely lives elsewhere.
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
if (corsOrigins.length > 0) {
  app.use(cors({ origin: corsOrigins }));
}

// Dropping the CORS headers stops a foreign page reading our responses, but a
// multipart POST is a "simple" request: the browser sends it anyway and only
// hides the reply, so the upload still lands and the encode still runs. On an
// unauthenticated service the cost *is* the attack, so reject a mismatched
// Origin outright. Origin's host is compared against the Host header nginx
// forwards, which means this needs no configuration and follows the app
// wherever it is reached from -- hostname, LAN address or localhost alike.
// A request with no Origin at all is left alone: curl, the smoke suite and
// every non-browser client send none, and none of them are the threat here.
const originAllowed = (req) => {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (corsOrigins.includes(origin)) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
};

app.use((req, res, next) => {
  if (originAllowed(req)) return next();
  logger.warn(`Rejected cross-origin ${req.method} ${req.path}`);
  return res.status(403).json({ success: false, error: 'Cross-origin request rejected' });
});

// nginx is the only thing in front of this, and it sets X-Forwarded-For.
// Without this the limiter sees nginx's container address for every visitor and
// buckets them all together, so one busy client locks out everyone.
app.set('trust proxy', 1);

// Apply rate limiting. nginx proxies /api/* here with the prefix stripped, so
// the paths that actually arrive are /upload, /compression, ... -- mounting this
// on '/api/' matched nothing and the limiter never fired. /health is left open
// so container health checks cannot be throttled.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Each file costs roughly three requests (upload, process, download) and they
  // are sent per file, so a large batch adds up quickly. Set high enough not to
  // interrupt genuine use, low enough to blunt an unattended script.
  limit: 600,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(['/upload', '/compression', '/conversion', '/merge'], limiter);

// Parse JSON body
app.use(express.json());

// Compress responses
app.use(compression());

// Logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// API routes
app.use('/upload', uploadRoutes);
app.use('/compression', compressionRoutes);
app.use('/conversion', conversionRoutes);
app.use('/merge', mergeRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// Clean up temp files periodically
const cleanupInterval = 3600000; // 1 hour
setInterval(() => {
  logger.info('Running temp file cleanup');
  const now = Date.now();
  
  fs.readdir(tempDir, (err, files) => {
    if (err) {
      logger.error('Error reading temp directory', err);
      return;
    }
    
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          logger.error(`Error getting stats for file ${file}`, err);
          return;
        }
        
        // Remove files older than 1 hour. Merge jobs use scratch directories;
        // a crash mid-merge could leave one behind, so sweep those too.
        if (now - stats.mtimeMs > 3600000) {
          const remove = stats.isDirectory()
            ? cb => fs.rm(filePath, { recursive: true, force: true }, cb)
            : cb => fs.unlink(filePath, cb);
          remove(err => {
            if (err) {
              logger.error(`Error deleting file ${file}`, err);
            } else {
              logger.info(`Deleted old temp file: ${file}`);
            }
          });
        }
      });
    });
  });
}, cleanupInterval);

module.exports = app;