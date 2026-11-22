-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "semester_id" UUID NOT NULL,
    "course_name" TEXT NOT NULL,
    "exam_date" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "location" TEXT,
    "seat_no" TEXT,
    "exam_type" TEXT,
    "campus" TEXT,
    "note" TEXT,
    "source" "CourseSource" NOT NULL DEFAULT 'manual',
    "import_key" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exams_user_id_semester_id_idx" ON "exams"("user_id", "semester_id");

-- CreateIndex
CREATE INDEX "exams_user_id_exam_date_idx" ON "exams"("user_id", "exam_date");

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
