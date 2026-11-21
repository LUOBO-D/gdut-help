-- CreateEnum
CREATE TYPE "MerchantCategory" AS ENUM ('canteen', 'restaurant', 'noodle', 'fastfood', 'drink', 'snack', 'dessert', 'hotpot');

-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('pending', 'approved', 'rejected', 'closed');

-- CreateEnum
CREATE TYPE "MerchantConfirmKind" AS ENUM ('exists', 'closed');

-- CreateEnum
CREATE TYPE "MerchantEditStatus" AS ENUM ('pending', 'applied', 'rejected');

-- CreateEnum
CREATE TYPE "DishStatus" AS ENUM ('visible', 'hidden');

-- CreateEnum
CREATE TYPE "MoodType" AS ENUM ('happy', 'calm', 'tired', 'anxious', 'down', 'treat');

-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('lunch', 'dinner');

-- CreateEnum
CREATE TYPE "MealFeedbackAction" AS ENUM ('accepted', 'skipped', 'disliked');

-- CreateTable
CREATE TABLE "user_preferences" (
    "user_id" UUID NOT NULL,
    "tastes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dislikes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "budget_min" SMALLINT,
    "budget_max" SMALLINT,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "MerchantCategory" NOT NULL,
    "campus_id" TEXT NOT NULL,
    "location_text" TEXT NOT NULL,
    "walk_minutes" SMALLINT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "price_avg" SMALLINT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "open_hours" JSONB,
    "submitted_by" UUID NOT NULL,
    "confirm_count" SMALLINT NOT NULL DEFAULT 0,
    "status" "MerchantStatus" NOT NULL DEFAULT 'approved',
    "rating_avg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "bayes_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_confirmations" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "MerchantConfirmKind" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_edits" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "changes" JSONB NOT NULL,
    "confirm_count" SMALLINT NOT NULL DEFAULT 0,
    "status" "MerchantEditStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "merchant_edits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dishes" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" SMALLINT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submitted_by" UUID NOT NULL,
    "status" "DishStatus" NOT NULL DEFAULT 'visible',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "dishes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mood_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "mood" "MoodType" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "mood_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_feedback" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "meal" "MealType" NOT NULL,
    "action" "MealFeedbackAction" NOT NULL,
    "date" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "merchants_campus_id_status_idx" ON "merchants"("campus_id", "status");

-- CreateIndex
CREATE INDEX "merchants_submitted_by_idx" ON "merchants"("submitted_by");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_confirmations_merchant_id_user_id_kind_key" ON "merchant_confirmations"("merchant_id", "user_id", "kind");

-- CreateIndex
CREATE INDEX "merchant_edits_merchant_id_status_idx" ON "merchant_edits"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "dishes_merchant_id_status_idx" ON "dishes"("merchant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "mood_logs_user_id_date_key" ON "mood_logs"("user_id", "date");

-- CreateIndex
CREATE INDEX "meal_feedback_user_id_date_meal_idx" ON "meal_feedback"("user_id", "date", "meal");

-- CreateIndex
CREATE INDEX "meal_feedback_user_id_merchant_id_idx" ON "meal_feedback"("user_id", "merchant_id");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_confirmations" ADD CONSTRAINT "merchant_confirmations_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_confirmations" ADD CONSTRAINT "merchant_confirmations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_edits" ADD CONSTRAINT "merchant_edits_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_edits" ADD CONSTRAINT "merchant_edits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mood_logs" ADD CONSTRAINT "mood_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_feedback" ADD CONSTRAINT "meal_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_feedback" ADD CONSTRAINT "meal_feedback_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
