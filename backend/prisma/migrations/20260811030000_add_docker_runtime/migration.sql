-- Runtime selection per app.
--
-- `runtime` defaults to 'auto' so newly created apps pick Docker up on their own,
-- but every app that already exists is pinned to 'pm2': those are running right now
-- under PM2 (or as static files), and a stray Dockerfile left in one of their repos
-- must not silently move them to a different supervisor on their next redeploy.
-- Opting an existing app in is a deliberate change in the panel.
ALTER TABLE "App" ADD COLUMN "runtime" TEXT NOT NULL DEFAULT 'auto';
UPDATE "App" SET "runtime" = 'pm2';

-- What is actually supervising the app, written at the end of each deploy. Backfilled
-- from the app type so status, logs and metrics read the right source before the first
-- deploy under this version happens.
ALTER TABLE "App" ADD COLUMN "activeRuntime" TEXT;
UPDATE "App" SET "activeRuntime" = CASE WHEN "type" = 'vitejs' THEN 'static' ELSE 'pm2' END;

ALTER TABLE "App" ADD COLUMN "containerPort" INTEGER;
ALTER TABLE "App" ADD COLUMN "dockerContext" TEXT;
