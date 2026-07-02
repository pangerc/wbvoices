-- AAC-185 — server_settings: single-row global flags + maintenance mode.
-- All flags default OFF; maintenance_mode defaults false (fresh deploy keeps
-- current behaviour). Hand-written to match the repo's existing manual-psql
-- migration practice (the drizzle journal only logs 0000; 0001-0003 were
-- applied directly). Apply on prod via `psql -f` per work-notes/deployment-amplify.md.
CREATE TABLE IF NOT EXISTS "server_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"maintenance_mode" boolean DEFAULT false NOT NULL,
	"maintenance_message" text,
	"backup_export_enabled" boolean DEFAULT false NOT NULL,
	"backup_import_enabled" boolean DEFAULT false NOT NULL,
	"restore_from_file_enabled" boolean DEFAULT false NOT NULL,
	"import_write_concurrency" integer DEFAULT 4 NOT NULL,
	"import_batch_size" integer DEFAULT 50 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);
