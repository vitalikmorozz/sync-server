ALTER TABLE "files" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "files_expires_at_idx" ON "files" USING btree ("expires_at");