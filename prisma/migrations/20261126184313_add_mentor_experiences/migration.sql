-- CreateTable
CREATE TABLE "mentor_experiences" (
    "id" TEXT NOT NULL,
    "mentor_profile_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "start_year" INTEGER NOT NULL,
    "end_year" INTEGER,
    "summary" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentor_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mentor_experiences_mentor_profile_id_idx" ON "mentor_experiences"("mentor_profile_id");

-- AddForeignKey
ALTER TABLE "mentor_experiences" ADD CONSTRAINT "mentor_experiences_mentor_profile_id_fkey" FOREIGN KEY ("mentor_profile_id") REFERENCES "mentor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
