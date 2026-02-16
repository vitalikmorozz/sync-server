ALTER TABLE "files" ADD COLUMN "is_binary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "extension" text;--> statement-breakpoint
CREATE INDEX "files_extension_idx" ON "files" USING btree ("store_id","extension");--> statement-breakpoint
-- Backfill extension from path for existing rows
UPDATE "files" SET "extension" = LOWER(
  CASE
    WHEN "path" LIKE '%.%' AND "path" NOT LIKE '.%'
      THEN SUBSTRING("path" FROM '\.([^.]+)$')
    WHEN "path" LIKE '.%' AND "path" NOT LIKE '%.%.%'
      THEN NULL
    WHEN "path" LIKE '.%.%'
      THEN SUBSTRING("path" FROM '\.([^.]+)$')
    ELSE NULL
  END
) WHERE "extension" IS NULL;