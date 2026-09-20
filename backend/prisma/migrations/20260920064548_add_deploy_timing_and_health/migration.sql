-- AlterTable
ALTER TABLE "App" ADD COLUMN "healthPath" TEXT;

-- AlterTable
ALTER TABLE "Deploy" ADD COLUMN "finishedAt" DATETIME;
ALTER TABLE "Deploy" ADD COLUMN "parentId" TEXT;
ALTER TABLE "Deploy" ADD COLUMN "phases" TEXT;
ALTER TABLE "Deploy" ADD COLUMN "startedAt" DATETIME;

-- CreateIndex
CREATE INDEX "Deploy_appId_createdAt_idx" ON "Deploy"("appId", "createdAt");

-- CreateIndex
CREATE INDEX "Deploy_projectId_createdAt_idx" ON "Deploy"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Deploy_parentId_idx" ON "Deploy"("parentId");
