FROM node:18-alpine

# Install dependencies for file processing
RUN apk add --no-cache \
    ffmpeg \
    libreoffice \
    ghostscript \
    imagemagick

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY ./backend/package*.json ./

# Install app dependencies
RUN npm ci --only=production

# Copy app source code
COPY ./backend .

# Create a temp directory for file processing
RUN mkdir -p /app/temp && chmod 777 /app/temp

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4000
ENV MAX_FILE_SIZE=50MB

# Expose the port the app runs on
EXPOSE 4000

# Start the app
CMD ["node", "server.js"]