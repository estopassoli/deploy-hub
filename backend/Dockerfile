FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy built files
COPY dist ./dist

# Expose port
EXPOSE 10001

# Start the application
CMD ["node", "dist/main.js"]
