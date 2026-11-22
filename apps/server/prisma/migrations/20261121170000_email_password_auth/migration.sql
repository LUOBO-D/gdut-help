-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "password_hash" TEXT,
  ADD COLUMN "password_updated_at" TIMESTAMPTZ;
