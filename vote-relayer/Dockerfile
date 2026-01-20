FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production

# Copy relayer code
COPY src ./src

# Copy wallet file
COPY relayer-wallet.pem ./

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Set environment defaults
ENV PORT=3001
ENV NODE_ENV=production
ENV RELAYER_PEM_PATH=/app/relayer-wallet.pem

# Start relayer
CMD ["node", "src/server.js"]
