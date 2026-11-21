-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('visible', 'hidden', 'pending');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "remind_meal" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "score_taste" SMALLINT NOT NULL,
    "score_value" SMALLINT NOT NULL,
    "score_env" SMALLINT NOT NULL,
    "score_speed" SMALLINT NOT NULL,
    "score_overall" SMALLINT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "status" "ReviewStatus" NOT NULL DEFAULT 'visible',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_likes" (
    "review_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_likes_pkey" PRIMARY KEY ("review_id","user_id")
);

-- CreateTable
CREATE TABLE "meal_notify_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "meal" "MealType" NOT NULL,
    "merchant_id" UUID NOT NULL,
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_notify_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviews_merchant_id_status_created_at_idx" ON "reviews"("merchant_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_user_id_merchant_id_key" ON "reviews"("user_id", "merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "meal_notify_logs_user_id_date_meal_key" ON "meal_notify_logs"("user_id", "date", "meal");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_likes" ADD CONSTRAINT "review_likes_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_likes" ADD CONSTRAINT "review_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_notify_logs" ADD CONSTRAINT "meal_notify_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
