-- Migration: Add suggested_tones table (AAC-25)
-- Admin-managed tone-of-voice presets surfaced in the brief selector.

CREATE TABLE "suggested_tones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"voice_instructions" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "suggested_tones_is_active_idx" ON "suggested_tones" USING btree ("is_active");
--> statement-breakpoint
-- Seed the 5 presets that used to live hardcoded in BriefPanelV3
INSERT INTO "suggested_tones" ("title", "description", "voice_instructions", "is_active") VALUES
  ('Professional', 'Polished, measured cadence with clear articulation', 'Deliver with a polished, measured cadence. Keep articulation crisp and the tone confident but not stiff. Emphasize clarity over emotion; pause briefly around key phrases.', true),
  ('Energetic', 'High-octane delivery with bouncy rhythm', 'Bring high energy and enthusiasm. Keep the pace quick and the rhythm bouncy. Vary pitch noticeably to sound excited and upbeat without shouting.', true),
  ('Warm', 'Soft, inviting timbre that feels like a friend talking', 'Use a soft, inviting timbre with gentle pacing. Round out consonants and let the voice feel close, like a trusted friend. Relax the lower register and smile through the delivery.', true),
  ('Authoritative', 'Deep, confident delivery with deliberate pacing', 'Deep, confident delivery with deliberate pacing. Land each statement firmly. Minimize pitch variation and keep breaths grounded to convey calm authority.', true),
  ('Sarcastic', 'Dry, slightly exaggerated inflection with tongue-in-cheek edge', 'Dry, slightly exaggerated inflection. Lean on deadpan timing and subtle eye-rolls in the cadence. Let the tongue-in-cheek edge carry the humor without over-acting.', true);
