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

// Apply rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
});
app.use('/api/', limiter);

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