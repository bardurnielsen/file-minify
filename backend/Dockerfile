FROM node:18-bookworm-slim

# Install dependencies for file processing
# (Debian base: Alpine's libreoffice package has unsatisfiable deps)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ghostscript \
    imagemagick \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# ImageMagick's Debian policy blocks reading/writing PDFs by default,
# which the image<->PDF conversion routes rely on
RUN sed -i 's/rights="none" pattern="PDF"/rights="read|write" pattern="PDF"/' \
    /etc/ImageMagick-6/policy.xml

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

# Drop root: the process only ever needs to read /app and write /app/temp,
# and running as root turns any path bug into a whole-filesystem one.
RUN chown -R node:node /app
USER node

# Start the app
CMD ["node", "server.js"]
