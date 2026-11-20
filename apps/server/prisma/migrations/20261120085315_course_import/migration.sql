-- CreateEnum
CREATE TYPE "CourseSource" AS ENUM ('manual', 'import');

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "import_key" TEXT,
ADD COLUMN     "source" "CourseSource" NOT NULL DEFAULT 'manual';

