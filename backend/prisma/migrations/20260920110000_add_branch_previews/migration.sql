-- Migration aditiva, escrita à mão (mesma política das anteriores: o `migrate dev`
-- geraria um DROP TABLE "App" para adicionar três colunas).

-- CreateTable
CREATE TABLE "CertificateIssuance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "appId" TEXT,
    "countsToQuota" BOOLEAN NOT NULL DEFAULT true,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CertificateIssuance_issuedAt_idx" ON "CertificateIssuance"("issuedAt");
CREATE INDEX "CertificateIssuance_domain_issuedAt_idx" ON "CertificateIssuance"("domain", "issuedAt");

-- AlterTable
ALTER TABLE "App" ADD COLUMN "isPreview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "App" ADD COLUMN "previewOfAppId" TEXT;
ALTER TABLE "App" ADD COLUMN "previewBranch" TEXT;
