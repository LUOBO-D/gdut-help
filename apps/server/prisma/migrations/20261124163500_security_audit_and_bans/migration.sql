-- AlterTable
ALTER TABLE "refresh_tokens"
  ADD COLUMN IF NOT EXISTS "ip" TEXT,
  ADD COLUMN IF NOT EXISTS "native_version" SMALLINT;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SecuritySeverity" AS ENUM ('info', 'warn', 'critical');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SecurityBanKind" AS ENUM ('ip', 'subnet');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "security_audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "event" TEXT NOT NULL,
    "severity" "SecuritySeverity" NOT NULL DEFAULT 'info',
    "ip" TEXT,
    "user_agent" TEXT,
    "path" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "security_bans" (
    "id" UUID NOT NULL,
    "target" TEXT NOT NULL,
    "kind" "SecurityBanKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 100,
    "ban_count" SMALLINT NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "security_bans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "security_audit_logs_created_at_idx" ON "security_audit_logs"("created_at");
CREATE INDEX IF NOT EXISTS "security_audit_logs_user_id_created_at_idx" ON "security_audit_logs"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "security_audit_logs_event_created_at_idx" ON "security_audit_logs"("event", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "security_bans_target_key" ON "security_bans"("target");
CREATE INDEX IF NOT EXISTS "security_bans_expires_at_idx" ON "security_bans"("expires_at");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "security_audit_logs" ADD CONSTRAINT "security_audit_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
