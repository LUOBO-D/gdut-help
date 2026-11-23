-- AlterTable
ALTER TABLE "shared_courses"
  ADD COLUMN "course_code" TEXT,
  ADD COLUMN "sub_category" TEXT,
  ALTER COLUMN "submitted_by" DROP NOT NULL;

-- Normalize any legacy non-elective rows into general_elective
UPDATE "shared_courses"
SET "category" = 'general_elective'
WHERE "category" NOT IN ('general_elective', 'pe');

-- Update ForeignKey so deleting a user preserves shared catalog courses
ALTER TABLE "shared_courses" DROP CONSTRAINT "shared_courses_submitted_by_fkey";
ALTER TABLE "shared_courses"
  ADD CONSTRAINT "shared_courses_submitted_by_fkey"
  FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "shared_courses_course_name_idx" ON "shared_courses"("course_name");
CREATE INDEX "shared_courses_teacher_name_idx" ON "shared_courses"("teacher_name");
