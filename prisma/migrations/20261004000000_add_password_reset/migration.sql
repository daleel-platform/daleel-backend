-- Only token hashes are stored. Existing accounts need no reset data.
ALTER TABLE "users"
ADD COLUMN "password_reset_token_hash" TEXT,
ADD COLUMN "password_reset_expires_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_password_reset_token_hash_key" ON "users"("password_reset_token_hash");
