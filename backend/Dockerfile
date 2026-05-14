# Use lightweight Node.js image
FROM node:20-alpine

# Set working directory inside container
WORKDIR /app

# Copy package files first (better layer caching)
# If package.json hasn't changed, npm install is skipped on rebuild
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy rest of source code
COPY . .

# Expose API port
EXPOSE 5000

# Default command (overridden by docker-compose)
CMD ["npm", "run", "dev"]
