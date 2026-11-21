-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'DOCUMENT');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "file_name" TEXT,
ADD COLUMN     "file_size" INTEGER,
ADD COLUMN     "media_public_id" TEXT,
ADD COLUMN     "mime_type" TEXT,
ADD COLUMN     "type" "MessageType" NOT NULL DEFAULT 'TEXT',
ALTER COLUMN "content" SET DEFAULT '';
