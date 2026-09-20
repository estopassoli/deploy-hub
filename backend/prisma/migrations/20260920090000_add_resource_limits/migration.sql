-- Migration aditiva, escrita à mão (mesma política das anteriores: o `migrate dev`
-- geraria um DROP TABLE "App" para adicionar duas colunas nullable).
ALTER TABLE "App" ADD COLUMN "maxMemoryMb" INTEGER;
ALTER TABLE "App" ADD COLUMN "cpuLimit" REAL;
