-- AlterTable
ALTER TABLE "App" ADD COLUMN "buildCommand" TEXT;
ALTER TABLE "App" ADD COLUMN "envVars" TEXT;
ALTER TABLE "App" ADD COLUMN "installCommand" TEXT;
ALTER TABLE "App" ADD COLUMN "migrateCommand" TEXT;
ALTER TABLE "App" ADD COLUMN "startCommand" TEXT;

-- CreateTable
CREATE TABLE "AppMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appId" TEXT NOT NULL,
    "cpu" REAL NOT NULL DEFAULT 0,
    "memory" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppMetric_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailRecipient" TEXT,
    "slackWebhook" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "AppMetric_appId_createdAt_idx" ON "AppMetric"("appId", "createdAt");
