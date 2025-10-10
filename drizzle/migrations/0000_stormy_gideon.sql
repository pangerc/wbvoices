CREATE TABLE "voice_approvals" (
	"voice_key" text NOT NULL,
	"language" text NOT NULL,
	"accent" text NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "voice_approvals_voice_key_language_accent_pk" PRIMARY KEY("voice_key","language","accent")
);
--> statement-breakpoint
CREATE TABLE "voice_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voice_key" text NOT NULL,
	"provider" text NOT NULL,
	"voice_id" text NOT NULL,
	"is_hidden" text DEFAULT 'false' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "voice_metadata_voice_key_unique" UNIQUE("voice_key")
);
--> statement-breakpoint
CREATE INDEX "approval_voice_key_idx" ON "voice_approvals" USING btree ("voice_key");--> statement-breakpoint
CREATE INDEX "language_accent_idx" ON "voice_approvals" USING btree ("language","accent");--> statement-breakpoint
CREATE INDEX "voice_key_idx" ON "voice_metadata" USING btree ("voice_key");--> statement-breakpoint
CREATE INDEX "provider_idx" ON "voice_metadata" USING btree ("provider");