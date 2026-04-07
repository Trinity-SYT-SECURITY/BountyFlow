# Use Node.js 20 Alpine for better performance
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install dependencies
# Use npm install to allow lock file updates when package.json changes
RUN npm install

# Copy application code
COPY . .

# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED 1

# Expose port 3000
EXPOSE 3000

# Set environment variables
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000 || exit 1

# Start the development server
CMD ["npm", "run", "dev"]
