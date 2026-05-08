-- Migration: Add instruction_templates table (AAC-27 + AAC-28)
-- Admin-managed creative-strategy presets surfaced in the brief panel.
-- Distinct from suggested_tones: drives the *kind* of ad (script structure,
-- pacing, music mood, SFX density, word count) via a system-prompt addendum.
-- Per-template defaults pre-fill brief UI fields (pacing, CTA, duration);
-- default_music_style rides into the LLM prompt (no music UI in the brief);
-- best_practice is admin-only descriptive metadata.

CREATE TABLE "instruction_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"system_instructions" text NOT NULL,
	"example_output" text,
	"default_pacing" text,
	"default_cta" text,
	"default_duration_seconds" integer,
	"default_music_style" text,
	"best_practice" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "instruction_templates_is_active_idx" ON "instruction_templates" USING btree ("is_active");
--> statement-breakpoint
CREATE INDEX "instruction_templates_category_idx" ON "instruction_templates" USING btree ("category");
--> statement-breakpoint
-- Seed 6 Spotify-best-practice creative templates with their defaults.
INSERT INTO "instruction_templates" (
  "title", "description", "category", "system_instructions",
  "default_pacing", "default_cta", "default_duration_seconds",
  "default_music_style", "best_practice",
  "sort_order", "is_active"
) VALUES
  (
    'Optimized for 15s',
    'Tight single-speaker spot built for a 15-second slot.',
    'duration',
    'Target a 15-second runtime. Maximum 38 spoken words. Single speaker only. Open with the hook in the first 3 seconds and end with one clear call-to-action. Music should be energetic but non-intrusive — no big builds. Avoid SFX unless one critical sound advances the story. Cut any line that does not move the listener toward the CTA.',
    'fast', NULL, 15,
    'energetic, non-intrusive — no big builds',
    'Spotify: hook the listener in the first 3 seconds; one CTA at the end.',
    10, true
  ),
  (
    'Optimized for 30s',
    'Two-speaker spot with a full narrative arc for a 30-second slot.',
    'duration',
    'Target a 30-second runtime. 60 to 80 spoken words. Up to two speakers, with distinct roles (e.g., narrator + character). Structure: hook (0-5s), tension or benefit (5-22s), resolution and CTA (22-30s). Music should support mood throughout and lift slightly under the CTA. SFX optional, used sparingly to mark scene transitions.',
    'normal', NULL, 30,
    'mood-supporting bed; lift slightly under the CTA',
    'Spotify: 30s allows a full narrative arc — hook, tension, resolution + CTA.',
    20, true
  ),
  (
    'Gen Z Oriented',
    'Informal, fast-paced delivery for a younger audience.',
    'audience',
    'Write for a Gen Z listener. Use informal register and contemporary vernacular — avoid corporate or marketing-speak. Keep sentences short and the pacing fast. Reference relatable everyday scenarios (group chats, doom-scrolling, late-night cravings) over aspirational lifestyle imagery. Music should be modern: electronic, hip-hop adjacent, hyperpop, or alt-pop. Voice direction: conversational, slightly self-aware, unforced.',
    'fast', NULL, NULL,
    'modern: electronic, hip-hop adjacent, hyperpop, or alt-pop',
    'Reach Gen Z with informal register, contemporary vernacular, and modern production.',
    30, true
  ),
  (
    'Storytelling / Narrative',
    'Cinematic mini-story with characters, tension, and resolution.',
    'experience',
    'Open with a scene, not a pitch. Introduce 2 to 3 characters or a single first-person voice in a specific moment. Build tension through dialogue or internal monologue, then resolve with the product as the answer. Music should build gradually — a soft bed underneath the setup, lifting at the resolution. SFX should be cinematic and scene-specific (footsteps, ambient room tone, weather) to anchor the listener in the world.',
    'normal', NULL, NULL,
    'gradual build — soft bed under the setup, lift at the resolution',
    'Cinematic mini-story structure: scene → tension → product as the resolution.',
    40, true
  ),
  (
    'Immersive Experience',
    'Sound-design-led spot with minimal voice and rich atmosphere.',
    'experience',
    'Lead with sound design, not narration. Voice should be sparse — short, evocative lines or a single tagline at the end. Build a layered atmospheric soundscape: ambient pad, environmental SFX, subtle rhythmic elements. The listener should feel transported into a place or feeling. Music must be atmospheric (ambient, cinematic, textural) — no traditional verse-chorus structure.',
    'normal', NULL, NULL,
    'atmospheric / cinematic / textural — no traditional verse-chorus structure',
    'Sound-design-led: sparse voice, layered ambient + environmental SFX.',
    50, true
  ),
  (
    'Product Feature Focus',
    'Clear, benefit-first spot that demonstrates the product.',
    'general',
    'Open with the single strongest product benefit. Lead with facts, numbers, or a concrete demonstration. Confident, factual tone — no over-promise, no fluff. Structure each line around one feature or benefit; do not chain unrelated claims. Music stays in the background as a confidence cue. Use SFX only when they directly demonstrate the product (e.g., the click of a button, an engine starting). End with a direct, action-oriented CTA.',
    'normal', NULL, NULL,
    'background confidence cue — no big builds',
    'Benefit-first: lead with the strongest feature, factual tone, direct CTA.',
    60, true
  );
