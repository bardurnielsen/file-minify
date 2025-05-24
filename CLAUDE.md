# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FileMinify is a containerized web application for file compression and conversion. It consists of:
- **Frontend**: React + TypeScript (Vite) application with Tailwind CSS
- **Backend**: Node.js/Express API for file processing
- **Infrastructure**: Docker Compose setup with nginx reverse proxy

## Common Development Commands

### Running the Application

**Production (Docker Compose):**
```bash
docker-compose up -d
```
- Frontend: http://localhost:3050 (port defined in docker-compose.yml)
- Backend API: http://localhost:4000

**Development Mode:**
```bash
# Frontend (root directory)
npm install
npm run dev  # Runs on http://localhost:5173 (Vite default)

# Backend (separate terminal)
cd backend
npm install
npm run dev  # Runs on http://localhost:4000
```

### Build and Testing
```bash
# Build frontend for production
npm run build

# Lint frontend code
npm run lint

# Preview production build locally
npm run preview

# Type checking (via build command)
npm run build
```

**Note**: No test framework is configured. If tests are needed, consider adding Vitest for frontend and Jest for backend.

## Architecture

### Frontend Structure
- **State Management**: Zustand store in `src/hooks/useFiles.ts` manages file upload queue and processing state
- **Component Organization**:
  - `src/components/file-processor/`: Core functionality (FileUploader, ProcessingQueue, FormatSelector, etc.)
  - `src/components/layout/`: App structure (Header, Footer, Layout)
  - `src/components/ui/`: Reusable Radix UI components
- **Type Definitions**: `src/types.ts` contains all TypeScript interfaces
- **API Communication**: Direct fetch calls to backend endpoints with FormData for file uploads

### Backend Architecture
- **Entry Point**: `server.js` - Express server with middleware setup
- **Route Structure**:
  - `routes/upload.js`: Handles file upload with Multer
  - `routes/compression.js`: PDF, image, and video compression logic
  - `routes/conversion.js`: Office document to PDF conversion
- **Processing Libraries**:
  - Sharp for image manipulation
  - pdf-lib for PDF compression
  - FFmpeg (via ffmpeg-static) for video processing
  - LibreOffice (in Docker container) for document conversion
- **File Management**: Temporary files stored in `/app/temp` (Docker) or `backend/temp` (local), cleaned after processing
- **Error Handling**: Centralized error handler in `middleware/errorHandler.js`
- **Logging**: Winston logger configured in `utils/logger.js`

### Docker Configuration
- **Frontend Container**: Multi-stage build, serves via nginx on port 80
- **Backend Container**: Includes LibreOffice installation for document conversion
- **Networking**: Frontend proxies `/api/*` requests to backend:4000
- **Volumes**: `temp_files` volume for processing temporary files

## Key Implementation Details

- **File Upload Flow**:
  1. Frontend uses react-dropzone for file selection
  2. Files are uploaded to `/api/upload` endpoint
  3. Backend processes files based on operation type
  4. Processed files are returned as downloadable responses
  5. Temporary files are automatically cleaned up

- **Processing Options**:
  - Images: Quality adjustment (0-100), format conversion
  - PDFs: Compression level selection
  - Videos: Bitrate and resolution adjustment
  - Documents: Direct conversion to PDF via LibreOffice

- **Security Measures**:
  - Rate limiting: 100 requests per 15 minutes per IP
  - File size limit: 50MB (configurable via MAX_FILE_SIZE env var)
  - Helmet.js for security headers
  - CORS configured for cross-origin requests
  - Input validation with Joi

- **Environment Variables**:
  - `PORT`: Backend server port (default: 4000)
  - `NODE_ENV`: development/production
  - `MAX_FILE_SIZE`: Maximum upload size
  - `VITE_API_URL`: Backend URL for frontend (Docker only)

## Non-Obvious Implementation Details

- **Temporary File Cleanup**: Runs every hour, deletes files older than 1 hour
- **UUID File Naming**: Prevents conflicts in multi-user scenarios
- **API Proxy Pattern**: nginx rewrites `/api/*` to `http://backend:4000/*` in Docker
- **Vite Optimization**: lucide-react excluded from optimization to prevent build issues
- **State Updates**: Global options cascade to all idle files in the queue
- **Error Recovery**: Files persist in UI even on processing errors for retry capability
- **Office Conversion**: Limited to PDF output only (LibreOffice constraint)
- **Logging Strategy**: Winston with rotating files, Morgan HTTP logs piped to Winston

## Memories
- Use docker compose to run this project
- No test framework is configured - tests need to be set up if required
- Frontend port is 3050 in Docker, 5173 in development
- Temporary files are automatically cleaned up after processing