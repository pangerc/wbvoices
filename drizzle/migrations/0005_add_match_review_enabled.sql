-- AAC-255 — add the global match-review feature flag to server_settings.
-- Default OFF so existing deploys keep current behaviour until explicitly enabled
-- from the admin panel. Hand-written to match the repo's manual-psql migration
-- practice. Apply on prod via `psql -f` per work-notes/deployment-amplify.md.
ALTER TABLE "server_settings"
	ADD COLUMN IF NOT EXISTS "match_review_enabled" boolean DEFAULT false NOT NULL;
