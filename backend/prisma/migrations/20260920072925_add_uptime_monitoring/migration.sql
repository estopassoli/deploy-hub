-- Migration escrita à mão: puramente aditiva.
--
-- O `prisma migrate dev` geraria de novo um DROP TABLE "App" para adicionar as quatro
-- colunas de monitoramento. Mesma política das migrations anteriores: o SQLite aceita
-- ADD COLUMN para colunas nullable e para NOT NULL com DEFAULT constante, então a
-- tabela central do painel não precisa ser recriada.

-- CreateTable
CREATE TABLE "UptimeCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "statusCode" INTEGER,
    "responseMs" INTEGER,
    "error" TEXT,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UptimeCheck_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "UptimeCheck_appId_checkedAt_idx" ON "UptimeCheck"("appId", "checkedAt");

-- AlterTable
ALTER TABLE "App" ADD COLUMN "uptimeEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "App" ADD COLUMN "lastUptimeStatus" TEXT;
ALTER TABLE "App" ADD COLUMN "lastUptimeAt" DATETIME;
ALTER TABLE "App" ADD COLUMN "sslExpiresAt" DATETIME;
