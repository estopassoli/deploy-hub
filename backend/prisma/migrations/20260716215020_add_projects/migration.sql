-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "packageManager" TEXT,
    "envVars" TEXT,
    "currentPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'stopped',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_App" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "domain" TEXT,
    "repository" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "status" TEXT NOT NULL DEFAULT 'stopped',
    "currentPath" TEXT,
    "envVars" TEXT,
    "installCommand" TEXT,
    "buildCommand" TEXT,
    "migrateCommand" TEXT,
    "startCommand" TEXT,
    "appDir" TEXT,
    "workspacePackage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "webhookSecret" TEXT,
    "projectId" TEXT,
    CONSTRAINT "App_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_App" ("appDir", "branch", "buildCommand", "createdAt", "currentPath", "domain", "envVars", "id", "installCommand", "migrateCommand", "name", "port", "repository", "startCommand", "status", "type", "updatedAt", "webhookSecret", "workspacePackage") SELECT "appDir", "branch", "buildCommand", "createdAt", "currentPath", "domain", "envVars", "id", "installCommand", "migrateCommand", "name", "port", "repository", "startCommand", "status", "type", "updatedAt", "webhookSecret", "workspacePackage" FROM "App";
DROP TABLE "App";
ALTER TABLE "new_App" RENAME TO "App";
CREATE UNIQUE INDEX "App_name_key" ON "App"("name");
CREATE UNIQUE INDEX "App_port_key" ON "App"("port");
CREATE TABLE "new_Deploy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appId" TEXT,
    "projectId" TEXT,
    "version" TEXT NOT NULL,
    "commitHash" TEXT,
    "commitMessage" TEXT,
    "path" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "logs" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Deploy_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deploy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Deploy" ("appId", "commitHash", "commitMessage", "createdAt", "id", "isCurrent", "logs", "path", "status", "version") SELECT "appId", "commitHash", "commitMessage", "createdAt", "id", "isCurrent", "logs", "path", "status", "version" FROM "Deploy";
DROP TABLE "Deploy";
ALTER TABLE "new_Deploy" RENAME TO "Deploy";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Project_name_key" ON "Project"("name");
