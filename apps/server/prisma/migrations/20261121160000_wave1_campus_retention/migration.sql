-- CreateEnum
CREATE TYPE "TodoRepeat" AS ENUM ('none', 'daily', 'weekly');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "class_remind_minutes" SMALLINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "todos" ADD COLUMN "repeat" "TodoRepeat" NOT NULL DEFAULT 'none';

-- CreateTable
CREATE TABLE "class_notify_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "course_id" UUID NOT NULL,
    "period_start" SMALLINT NOT NULL,
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_notify_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_shares" (
    "code" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "semester_id" UUID NOT NULL,
    "courses" JSONB NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_shares_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE UNIQUE INDEX "class_notify_logs_user_id_date_course_id_period_start_key" ON "class_notify_logs"("user_id", "date", "course_id", "period_start");

-- CreateIndex
CREATE INDEX "timetable_shares_expires_at_idx" ON "timetable_shares"("expires_at");

-- AddForeignKey
ALTER TABLE "class_notify_logs" ADD CONSTRAINT "class_notify_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_shares" ADD CONSTRAINT "timetable_shares_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_shares" ADD CONSTRAINT "timetable_shares_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
