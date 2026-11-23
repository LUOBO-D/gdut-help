-- CreateEnum
CREATE TYPE "CetLevel" AS ENUM ('cet4', 'cet6');

-- CreateTable
CREATE TABLE "cet_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "level" "CetLevel" NOT NULL,
    "exam_session" TEXT NOT NULL,
    "total_score" SMALLINT NOT NULL,
    "listening" SMALLINT,
    "reading" SMALLINT,
    "writing" SMALLINT,
    "oral_grade" TEXT,
    "ticket_no" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cet_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_selection_reminders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'elective',
    "start_at" TIMESTAMPTZ NOT NULL,
    "end_at" TIMESTAMPTZ,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lead_minutes" SMALLINT[] DEFAULT ARRAY[1440, 30, 5]::SMALLINT[],
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "course_selection_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cet_records_user_id_level_idx" ON "cet_records"("user_id", "level");

-- CreateIndex
CREATE UNIQUE INDEX "cet_records_user_id_level_exam_session_key" ON "cet_records"("user_id", "level", "exam_session");

-- CreateIndex
CREATE INDEX "course_selection_reminders_user_id_start_at_idx" ON "course_selection_reminders"("user_id", "start_at");

-- AddForeignKey
ALTER TABLE "cet_records" ADD CONSTRAINT "cet_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_selection_reminders" ADD CONSTRAINT "course_selection_reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
