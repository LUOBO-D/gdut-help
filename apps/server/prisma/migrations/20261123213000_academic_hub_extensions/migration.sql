-- CreateEnum
CREATE TYPE "SecondClassCategory" AS ENUM ('ideology', 'volunteer', 'innovation', 'culture', 'practice', 'leadership');

-- CreateEnum
CREATE TYPE "SecondClassStatus" AS ENUM ('approved', 'pending');

-- CreateEnum
CREATE TYPE "SharedCourseCategory" AS ENUM ('general_elective', 'general_required', 'major_required', 'major_elective', 'pe', 'other');

-- CreateEnum
CREATE TYPE "CourseAttendanceLevel" AS ENUM ('none', 'occasional', 'strict');

-- CreateEnum
CREATE TYPE "CourseExamFormat" AS ENUM ('open_book', 'closed_book', 'paper', 'project', 'mixed');

-- CreateTable
CREATE TABLE "user_credit_plans" (
    "user_id" UUID NOT NULL,
    "total_target" DOUBLE PRECISION NOT NULL DEFAULT 160,
    "general_required_target" DOUBLE PRECISION NOT NULL DEFAULT 42,
    "major_required_target" DOUBLE PRECISION NOT NULL DEFAULT 64,
    "major_elective_target" DOUBLE PRECISION NOT NULL DEFAULT 22,
    "general_elective_target" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "practice_target" DOUBLE PRECISION NOT NULL DEFAULT 22,
    "major_name" TEXT,
    "official_modules" JSONB,
    "official_synced_at" TIMESTAMPTZ,
    "second_class_semester_target" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "second_class_year_target" DOUBLE PRECISION NOT NULL DEFAULT 24,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_credit_plans_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "second_class_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "academic_year" TEXT NOT NULL,
    "semester_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "SecondClassCategory" NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "credits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "activity_date" TEXT NOT NULL,
    "organizer" TEXT,
    "status" "SecondClassStatus" NOT NULL DEFAULT 'approved',
    "source" "CourseSource" NOT NULL DEFAULT 'manual',
    "import_key" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "second_class_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_courses" (
    "id" UUID NOT NULL,
    "course_name" TEXT NOT NULL,
    "teacher_name" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL DEFAULT 'hemc',
    "category" "SharedCourseCategory" NOT NULL DEFAULT 'general_elective',
    "department" TEXT,
    "credits" DOUBLE PRECISION,
    "submitted_by" UUID NOT NULL,
    "rating_overall" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating_grading" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating_workload" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating_quality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "bayes_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "top_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "shared_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_reviews" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "score_overall" SMALLINT NOT NULL,
    "score_grading" SMALLINT NOT NULL,
    "score_workload" SMALLINT NOT NULL,
    "score_quality" SMALLINT NOT NULL,
    "attendance" "CourseAttendanceLevel" NOT NULL,
    "exam_format" "CourseExamFormat" NOT NULL,
    "semester_taken" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "content" TEXT NOT NULL DEFAULT '',
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "status" "ReviewStatus" NOT NULL DEFAULT 'visible',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "course_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_review_likes" (
    "review_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_review_likes_pkey" PRIMARY KEY ("review_id","user_id")
);

-- CreateIndex
CREATE INDEX "second_class_records_user_id_academic_year_semester_code_idx" ON "second_class_records"("user_id", "academic_year", "semester_code");

-- CreateIndex
CREATE INDEX "second_class_records_user_id_import_key_idx" ON "second_class_records"("user_id", "import_key");

-- CreateIndex
CREATE UNIQUE INDEX "shared_courses_course_name_teacher_name_campus_id_key" ON "shared_courses"("course_name", "teacher_name", "campus_id");

-- CreateIndex
CREATE INDEX "shared_courses_campus_id_bayes_score_idx" ON "shared_courses"("campus_id", "bayes_score");

-- CreateIndex
CREATE INDEX "shared_courses_category_bayes_score_idx" ON "shared_courses"("category", "bayes_score");

-- CreateIndex
CREATE UNIQUE INDEX "course_reviews_user_id_course_id_key" ON "course_reviews"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "course_reviews_course_id_status_like_count_idx" ON "course_reviews"("course_id", "status", "like_count");

-- AddForeignKey
ALTER TABLE "user_credit_plans" ADD CONSTRAINT "user_credit_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "second_class_records" ADD CONSTRAINT "second_class_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_courses" ADD CONSTRAINT "shared_courses_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "shared_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_review_likes" ADD CONSTRAINT "course_review_likes_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "course_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_review_likes" ADD CONSTRAINT "course_review_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
