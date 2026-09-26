const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Configuration comes from the environment: the image sets the defaults and
// Compose passes the rest. There is no .env file.

// Import routes
const uploadRoutes = require('./routes/upload');
const compressionRoutes = require('./routes/compression');
const conversionRoutes = require('./routes/conversion');
const mergeRoutes = require('./routes/merge');

// Import utilities
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const { TEMP_DIR } = require('./utils/paths');
const { toolReport } = require('./utils/tools');
const { lanAddresses } = require('./utils/network');

const PORT = process.env.PORT || 4000;
// FM_HOST narrows where it listens; the Windows launcher uses 127.0.0.1 unless
// phones on the LAN were allowed in. Unset means every interface, as in Docker.
const HOST = process.env.FM_HOST || undefined;

// The Windows build has no nginx: FM_STATIC_DIR points at the built frontend
// and this server delivers it, plus the API under /api as nginx would.
const STATIC_DIR = process.env.FM_STATIC_DIR ? path.resolve(process.env.FM_STATIC_DIR) : null;

// Create Express app
const app = express();

// Set security-related middleware. When serving the app itself it needs the
// CSP nginx sends (blob: previews, inline styles). useDefaults is off because
// helmet's defaults include upgrade-insecure-requests, which breaks the app on
// plain http from a phone on the LAN.
app.use(helmet(STATIC_DIR ? {
  frameguard: { action: 'deny' },
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"],
    },
  },
} : undefined));

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

// Natively, the Origin == Host check alone does not stop DNS rebinding: a page
// on evil.example whose name is re-pointed at this PC sends a matching Origin
// and Host. Its Host is still a name the PC doesn't go by, so natively only
// its own names and plain IP addresses are served. (In Docker nginx answers
// every name, and the ship's server is reached by several.)
const hostAllowed = (req) => {
  if (!STATIC_DIR) return true;
  const host = (req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
  const self = os.hostname().toLowerCase();
  return host === 'localhost' || host === self || host === `${self}.local` ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^\[[0-9a-f:.]+\]$/.test(host);
};

app.use((req, res, next) => {
  if (!hostAllowed(req)) {
    logger.warn(`Rejected request for host ${req.headers.host}`);
    return res.status(403).json({ success: false, error: 'Unknown host name' });
  }
  if (originAllowed(req)) return next();
  logger.warn(`Rejected cross-origin ${req.method} ${req.path}`);
  return res.status(403).json({ success: false, error: 'Cross-origin request rejected' });
});

// nginx is the only thing in front of this, and it sets X-Forwarded-For.
// Without this the limiter sees nginx's container address for every visitor and
// buckets them all together, so one busy client locks out everyone. Natively
// nothing is in front, so the launcher sets FM_TRUST_PROXY=0: trusting the
// header there would let a client pick its own address (invariant 6).
const trustProxy = process.env.FM_TRUST_PROXY;
app.set('trust proxy', trustProxy === undefined ? 1
  : /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

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
const api = express.Router();
api.use(['/upload', '/compression', '/conversion', '/merge'], limiter);

// Parse JSON body
app.use(express.json());

// Compress responses
app.use(compression());

// Logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Create temp directory if it doesn't exist
const tempDir = TEMP_DIR;
fs.mkdirSync(tempDir, { recursive: true });

// API routes
api.use('/upload', uploadRoutes);
api.use('/compression', compressionRoutes);
api.use('/conversion', conversionRoutes);
api.use('/merge', mergeRoutes);

// Health check endpoint
// ?tools adds where each external tool was found (null: missing), which is
// how a native install shows that one of them is not there. Only asked from
// this machine: the paths include the Windows user name.
const fromThisMachine = (req) =>
  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
api.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    ...(req.query.tools !== undefined && fromThisMachine(req) && { tools: toolReport() }),
  });
});

// Limits the frontend enforces before uploading. They come from the server's
// environment (MAX_FILE_SIZE), so changing them is a Compose setting, not code.
//
// Natively, the app on the PC itself also gets `phone`: whether phones on the
// network may connect (FM_HOST), and the addresses they would use, for its
// "Use on your phone" panel. Asked fresh each time, since a router can hand
// the PC a new address. Phones and other machines never get it.
api.get('/config', async (req, res) => {
  const phoneAccess = HOST !== '127.0.0.1';
  res.status(200).json({
    maxFileBytes: uploadRoutes.MAX_FILE_BYTES,
    maxFiles: uploadRoutes.MAX_FILES,
    ...(STATIC_DIR && fromThisMachine(req) && {
      phone: {
        enabled: phoneAccess,
        urls: phoneAccess ? (await lanAddresses()).map((a) => `http://${a}:${PORT}`) : [],
      },
    }),
  });
});

app.use(api);

if (STATIC_DIR) {
  app.use('/api', api);
  // An unknown API path is a JSON 404, not the app's index.html.
  app.use('/api', (req, res) => res.status(404).json({ success: false, error: 'Not found' }));
  // Vite's hashed bundles can be cached for good; everything else revalidates.
  app.use('/assets', express.static(path.join(STATIC_DIR, 'assets'), {
    maxAge: '30d', immutable: true,
  }));
  app.use(express.static(STATIC_DIR));
  app.get('/{*path}', (req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));
}

// Error handling middleware
app.use(errorHandler);

// Start server
const server = app.listen(PORT, HOST, () => {
  logger.info(`Server running on ${HOST || 'all interfaces'}, port ${PORT}`);
  for (const [name, found] of Object.entries(toolReport())) {
    if (found) logger.info(`Tool ${name}: ${found}`);
    else logger.warn(`Tool ${name}: NOT FOUND - features using it will fail`);
  }
});

// In Docker nginx takes in the whole upload before passing it on, quickly.
// Natively a phone streams straight into Node, whose default requestTimeout
// (5 minutes to receive a request) would cut off a large video on slow Wi-Fi.
if (STATIC_DIR) {
  const timeoutMin = Number(process.env.PROCESS_TIMEOUT_MIN);
  server.requestTimeout = (timeoutMin > 0 ? timeoutMin : 5) * 60 * 1000;
}

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