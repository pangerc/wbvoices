-- AAC-255 — gate the per-card "Regenerate" action of the AI match-review.
-- Default OFF (Apply/minimal-edit is always available). Hand-written to match
-- the repo's manual-psql migration practice; generated from schema.ts via
-- `drizzle-kit export`. Applied to Neon main on 2026-11-18.
ALTER TABLE "server_settings"
	ADD COLUMN IF NOT EXISTS "match_review_regenerate_enabled" boolean DEFAULT false NOT NULL;
