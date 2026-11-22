-- CreateEnum
CREATE TYPE "FitnessGender" AS ENUM ('male', 'female');

-- CreateTable
CREATE TABLE "fitness_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "academic_year" TEXT NOT NULL,
    "grade_year" SMALLINT NOT NULL,
    "gender" "FitnessGender" NOT NULL,
    "height_cm" DOUBLE PRECISION,
    "weight_kg" DOUBLE PRECISION,
    "lung_capacity_ml" INTEGER,
    "sprint_50m_sec" DOUBLE PRECISION,
    "sit_and_reach_cm" DOUBLE PRECISION,
    "standing_long_jump_cm" INTEGER,
    "strength_count" SMALLINT,
    "endurance_sec" SMALLINT,
    "exempt" BOOLEAN NOT NULL DEFAULT false,
    "official_total" DOUBLE PRECISION,
    "tested_at" TEXT,
    "note" TEXT,
    "source" "CourseSource" NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "fitness_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fitness_records_user_id_academic_year_key" ON "fitness_records"("user_id", "academic_year");

-- CreateIndex
CREATE INDEX "fitness_records_user_id_grade_year_idx" ON "fitness_records"("user_id", "grade_year");

-- AddForeignKey
ALTER TABLE "fitness_records" ADD CONSTRAINT "fitness_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
