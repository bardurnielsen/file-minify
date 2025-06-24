# FileMinify - File Compression & Conversion Tool

FileMinify is a modern web application that allows users to compress PDF files, videos, images, and convert office documents to PDF. Built with React, Node.js, and containerized with Docker for easy deployment.

## Features

- **PDF Compression**: Reduce PDF file sizes while maintaining quality
- **Image Optimization**: Compress JPEG, PNG, WebP images and convert between formats
- **Video Compression**: Shrink MP4, WebM, MOV, and AVI files for easier sharing
- **Document Conversion**: Convert Word, Excel, and PowerPoint files to PDF
- **Image to PDF**: Convert images directly to PDF format
- **Batch Processing**: Process multiple files at once with customizable settings
- **Format Conversion**: Convert between image formats (JPG, PNG, WebP)
- **Drag-and-Drop Interface**: Easy file upload with visual feedback
- **Quality Control**: Adjustable compression settings for each file
- **Secure & Private**: Files automatically deleted after 1 hour
- **No Registration**: Completely free, no signup required

## Tech Stack

### Frontend
- React with TypeScript
- Tailwind CSS for styling
- Framer Motion for animations
- Radix UI for accessible components
- React Dropzone for file uploads
- Zustand for state management

### Backend
- Node.js with Express
- Multer for file uploads
- Sharp for image processing
- pdf-lib for PDF operations
- FFmpeg for video processing
- LibreOffice for document conversion

### Infrastructure
- Docker and Docker Compose
- Nginx for serving frontend and proxying API requests
- Winston for logging
- Security with Helmet, rate limiting, and proper CORS configuration

## Getting Started

### Prerequisites
- Docker and Docker Compose installed
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/fileminify.git
cd fileminify
```

2. Build and start the Docker containers:
```bash
docker-compose up -d
```

3. Access the application at http://localhost:3050

## Development

### Running in development mode

1. Install frontend dependencies:
```bash
cd frontend
npm install
npm run dev
```

2. In a separate terminal, install backend dependencies:
```bash
cd backend
npm install
npm run dev
```

## Configuration

The application can be configured via environment variables:

### Backend Environment Variables
- `PORT`: Port for the backend server (default: 4000)
- `NODE_ENV`: Environment setting (development/production)
- `MAX_FILE_SIZE`: Maximum file size allowed for upload (default: 50MB)

## Security

FileMinify implements several security measures:
- HTTPS support through Nginx
- Secure HTTP headers with Helmet
- Request rate limiting
- Input validation
- Temporary file cleanup
- CORS policy

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.# Triggering rebuild
