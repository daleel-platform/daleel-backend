-- AlterTable
ALTER TABLE "mentor_profiles" ADD COLUMN     "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
ADD COLUMN     "embedding_model" TEXT;
