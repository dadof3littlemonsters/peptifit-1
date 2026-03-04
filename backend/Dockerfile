FROM node:18-slim

WORKDIR /app

# Install Python and build tools for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    sqlite3 \
    poppler-utils \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies (rebuild sqlite3 for this platform)
RUN npm install --production

# Copy application code
COPY . .

# Create data directory for SQLite database
RUN mkdir -p data

# Expose port
EXPOSE 3001

# Start the application
CMD ["npm", "start"]
