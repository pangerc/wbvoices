-- AAC-255 — append-only event log for the AI match-review (mismatches,
-- proposed improvement cards, applied improvements). Powers the day/month/year
-- stats page. Hand-written to match the repo's manual-psql migration practice.
-- Apply on prod via `psql -f` per work-notes/deployment-amplify.md.
CREATE TABLE IF NOT EXISTS "match_review_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_id" text NOT NULL,
	"job_id" text,
	"owner_email" text,
	"dimension" text NOT NULL,
	"matched" boolean DEFAULT false NOT NULL,
	"severity" text,
	"expected" text,
	"actual" text,
	"improvement_id" text,
	"event" text NOT NULL,
	"apply_method" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "match_review_events_created_at_idx" ON "match_review_events" ("created_at");
CREATE INDEX IF NOT EXISTS "match_review_events_ad_idx" ON "match_review_events" ("ad_id");
CREATE INDEX IF NOT EXISTS "match_review_events_dimension_idx" ON "match_review_events" ("dimension");
