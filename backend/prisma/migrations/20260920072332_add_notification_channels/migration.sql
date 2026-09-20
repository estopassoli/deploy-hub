-- Migration escrita à mão: puramente aditiva.
--
-- O `prisma migrate dev` geraria um RedefineTables (DROP TABLE "SystemSettings" +
-- recriação). Aqui a tabela tem uma linha só, então o risco é pequeno — mas o SQLite
-- aceita ADD COLUMN para todos estes casos (nullable, e NOT NULL com DEFAULT
-- constante), então não há motivo para dropar nada. Mesma política das migrations
-- anteriores deste repositório.
ALTER TABLE "SystemSettings" ADD COLUMN "discordWebhook" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "telegramBotToken" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "telegramChatId" TEXT;

ALTER TABLE "SystemSettings" ADD COLUMN "notifyDeployFailed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SystemSettings" ADD COLUMN "notifyDeploySuccess" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemSettings" ADD COLUMN "notifyRollback" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SystemSettings" ADD COLUMN "notifyAppDown" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SystemSettings" ADD COLUMN "notifySslExpiring" BOOLEAN NOT NULL DEFAULT true;
