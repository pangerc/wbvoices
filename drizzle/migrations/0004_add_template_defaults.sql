-- Migration: Add per-template defaults + best_practice (AAC-28)
-- When a template is selected in the brief panel, these defaults apply to
-- the brief's UI fields (pacing, CTA, duration). `default_music_style` rides
-- in the LLM system-prompt addendum (no UI field for music in the brief).
-- `best_practice` is admin-only descriptive metadata (which best practice
-- the template encodes — never sent to the LLM).

ALTER TABLE "instruction_templates"
  ADD COLUMN "default_pacing" text,
  ADD COLUMN "default_cta" text,
  ADD COLUMN "default_duration_seconds" integer,
  ADD COLUMN "default_music_style" text,
  ADD COLUMN "best_practice" text;
--> statement-breakpoint
-- Backfill defaults for the 6 seed templates so picking one in the brief
-- panel actually applies the constraints they describe in their prose.
UPDATE "instruction_templates"
   SET "default_duration_seconds" = 15,
       "default_pacing"           = 'fast',
       "default_music_style"      = 'energetic, non-intrusive — no big builds',
       "best_practice"            = 'Spotify: hook the listener in the first 3 seconds; one CTA at the end.'
 WHERE "title" = 'Optimized for 15s';

UPDATE "instruction_templates"
   SET "default_duration_seconds" = 30,
       "default_pacing"           = 'normal',
       "default_music_style"      = 'mood-supporting bed; lift slightly under the CTA',
       "best_practice"            = 'Spotify: 30s allows a full narrative arc — hook, tension, resolution + CTA.'
 WHERE "title" = 'Optimized for 30s';

UPDATE "instruction_templates"
   SET "default_pacing"      = 'fast',
       "default_music_style" = 'modern: electronic, hip-hop adjacent, hyperpop, or alt-pop',
       "best_practice"       = 'Reach Gen Z with informal register, contemporary vernacular, and modern production.'
 WHERE "title" = 'Gen Z Oriented';

UPDATE "instruction_templates"
   SET "default_pacing"      = 'normal',
       "default_music_style" = 'gradual build — soft bed under the setup, lift at the resolution',
       "best_practice"       = 'Cinematic mini-story structure: scene → tension → product as the resolution.'
 WHERE "title" = 'Storytelling / Narrative';

UPDATE "instruction_templates"
   SET "default_pacing"      = 'normal',
       "default_music_style" = 'atmospheric / cinematic / textural — no traditional verse-chorus structure',
       "best_practice"       = 'Sound-design-led: sparse voice, layered ambient + environmental SFX.'
 WHERE "title" = 'Immersive Experience';

UPDATE "instruction_templates"
   SET "default_pacing"      = 'normal',
       "default_music_style" = 'background confidence cue — no big builds',
       "best_practice"       = 'Benefit-first: lead with the strongest feature, factual tone, direct CTA.'
 WHERE "title" = 'Product Feature Focus';
