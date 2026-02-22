ALTER TYPE "public"."permission" ADD VALUE 'settings_read';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'settings_write';--> statement-breakpoint
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"hash" varchar(71) NOT NULL,
	"size" integer NOT NULL,
	"is_binary" boolean DEFAULT false NOT NULL,
	"extension" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "settings_store_path_unique_idx" ON "settings" USING btree ("store_id","path");--> statement-breakpoint
CREATE INDEX "settings_store_id_idx" ON "settings" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "settings_expires_at_idx" ON "settings" USING btree ("expires_at");