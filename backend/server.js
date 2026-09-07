const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Import routes
const uploadRoutes = require('./routes/upload');
const compressionRoutes = require('./routes/compression');
const conversionRoutes = require('./routes/conversion');

// Import utilities
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Create Express app
const app = express();

// Set security-related middleware
app.use(helmet());
app.use(cors());

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
  // Each file costs roughly three requests (upload, process, download), so a
  // batch adds up quickly. Set high enough not to interrupt genuine use, low
  // enough to blunt an unattended script.
  max: 600,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(['/upload', '/compression', '/conversion'], limiter);

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
        
        // Remove files older than 1 hour
        if (now - stats.mtimeMs > 3600000) {
          fs.unlink(filePath, err => {
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