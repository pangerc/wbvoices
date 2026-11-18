-- AAC-295 — user_assets: a user's own uploaded media (the SFX library),
-- reusable across every ad they own. One owner never holds the same bytes
-- twice (unique owner+kind+content_hash). Hand-written to match the repo's
-- manual-psql migration practice; generated from schema.ts via
-- `drizzle-kit export`. Applied to Neon main on 2026-11-18.
CREATE TABLE IF NOT EXISTS "user_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_email" text NOT NULL,
	"kind" text NOT NULL,
	"path" text NOT NULL,
	"filename" text NOT NULL,
	"format" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"duration_seconds" real NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_assets_path_unique" UNIQUE("path")
);
CREATE INDEX IF NOT EXISTS "user_assets_owner_kind_created_at_idx" ON "user_assets" USING btree ("owner_email","kind","created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "user_assets_owner_kind_hash_uq" ON "user_assets" USING btree ("owner_email","kind","content_hash");
