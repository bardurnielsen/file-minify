# Build stage
FROM node:25-alpine AS build

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# The config is a template rendered at startup (see nginx.conf.template), so the
# upload limit and proxy timeout are Compose settings rather than a rebuild.
# Only FM_* variables are substituted, never nginx's own $host and friends.
ENV NGINX_ENVSUBST_FILTER=^FM_
COPY ./frontend/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 ./frontend/nginx-limits.envsh /docker-entrypoint.d/16-nginx-limits.envsh

# Expose port
EXPOSE 80

# Start Nginx server
CMD ["nginx", "-g", "daemon off;"]