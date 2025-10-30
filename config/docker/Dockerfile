# Multi-stage build for RunRealm
FROM node:20-slim AS build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the frontend
RUN npm run build

# Production stage
FROM node:20-slim AS production

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built frontend and server files
COPY --from=build /app/public ./public
COPY --from=build /app/static ./static
COPY server.js ./

# Create non-root user for security
RUN groupadd -r runrealm && useradd -r -g runrealm runrealm
RUN chown -R runrealm:runrealm /app
USER runrealm

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/tokens || exit 1

# Start the server
CMD ["node", "server.js"]
