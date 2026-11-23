-- CreateTable
CREATE TABLE "course_grades" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "semester_code" TEXT NOT NULL,
    "semester_name" TEXT NOT NULL,
    "course_code" TEXT,
    "course_name" TEXT NOT NULL,
    "credits" DOUBLE PRECISION NOT NULL,
    "score_text" TEXT NOT NULL,
    "score_num" DOUBLE PRECISION,
    "grade_point" DOUBLE PRECISION NOT NULL,
    "course_type" TEXT,
    "exam_type" TEXT,
    "source" "CourseSource" NOT NULL DEFAULT 'manual',
    "import_key" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "course_grades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_grades_user_id_semester_code_idx" ON "course_grades"("user_id", "semester_code");

-- CreateIndex
CREATE INDEX "course_grades_user_id_import_key_idx" ON "course_grades"("user_id", "import_key");

-- AddForeignKey
ALTER TABLE "course_grades" ADD CONSTRAINT "course_grades_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
