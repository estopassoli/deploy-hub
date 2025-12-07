import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create admin user
  const adminEmail = 'admin@deployhub.local';
  const adminPassword = 'admin123';

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log('✓ Admin user already exists');
  } else {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: 'Administrator',
      },
    });
    console.log('✓ Admin user created');
    console.log(`  Email: ${adminEmail}`);
    console.log(`  Password: ${adminPassword}`);
  }

  // Create initial settings
  const settings = [
    { key: 'apps_dir', value: '/root/apps' },
    { key: 'retention_days', value: '30' },
  ];

  for (const setting of settings) {
    const existing = await prisma.setting.findUnique({
      where: { key: setting.key },
    });

    if (!existing) {
      await prisma.setting.create({ data: setting });
      console.log(`✓ Setting created: ${setting.key} = ${setting.value}`);
    }
  }

  console.log('');
  console.log('🚀 Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });