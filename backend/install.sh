#!/bin/bash

# DeployHub Backend Installation Script
# Run this on your VPS: bash install.sh

set -e

echo "🚀 Installing DeployHub Backend..."

# Create apps directory
mkdir -p /root/apps

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Generate Prisma client
echo "🗃️ Setting up database..."
npx prisma generate
npx prisma migrate dev --name init

# Create default admin user
echo "👤 Creating admin user..."
node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function main() {
  const prisma = new PrismaClient();
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  try {
    await prisma.user.create({
      data: {
        email: 'admin@deployhub.local',
        password: hashedPassword,
        name: 'Admin'
      }
    });
    console.log('✅ Admin user created: admin@deployhub.local / admin123');
  } catch (e) {
    console.log('Admin user already exists');
  }
  
  await prisma.\$disconnect();
}

main();
"

# Build
echo "🔨 Building..."
npm run build

# Setup PM2
echo "⚡ Setting up PM2..."
pm2 start dist/main.js --name deployhub-backend
pm2 save
pm2 startup

echo ""
echo "✅ DeployHub Backend installed successfully!"
echo ""
echo "📍 API running at: http://localhost:10001"
echo "🔐 Default login: admin@deployhub.local / admin123"
echo ""
echo "⚠️  IMPORTANT: Change the default password!"
