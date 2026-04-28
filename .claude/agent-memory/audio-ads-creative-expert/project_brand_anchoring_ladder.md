---
name: Brand-anchoring failure ladder (Apr 2026)
description: Two-stage failure model for brand voice in generated ads — pre-anchor vs post-anchor regression risks, and which intervention fits each stage
type: project
---

wb-voices output today reads as unanchored LLM-default voice ("global slop"), not as on-brand-but-boring. The "regression to brand mean" concern only becomes the dominant failure mode after Stage 1 is solved.

**The ladder:**
- Stage 1 (where we are): global LLM slop → on-brand competence. Intervention: auto-inject brand-library signals.
- Stage 2 (future risk): on-brand competence → on-brand monotony. Intervention: variance controls, opt-in reference modes, temperature/seed diversity.

**Discriminator on what to inject:**
- Anchors (safe, default ON): structured tonal axes (energy register, pacing, vocab register, sentence shapes), tagline, product canon, sign-off phrases, taboo words, locale formality.
- Middle ground (default ON, capped): short functional excerpts — hook + CTA only, ~40 words each. Anchors rhythm without giving a full template to xerox.
- Traps (opt-in only): full transcripts, "match this specific spot" mode. Useful for client-driven references; dangerous as defaults because LLMs pattern-match whole arcs.

**Why:** User pushback (Apr 2026) on the v3 brand-library plan exposed that the prior "do not auto-inject" default was implicitly assuming brand-anchored output existed. It doesn't.

**How to apply:** When designing brand-injection features, default ON for anchors and capped excerpts, opt-out via a single brief-form toggle, opt-in for full-transcript / match-spot modes. Don't pre-load Stage-2 mitigations until Stage 1 is shipped and measured.
