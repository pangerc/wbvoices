---
name: Volume semantics decision — dB trim around unity
description: Mixer per-clip volume reinterpreted as dB trim, stems pre-normalized server-side to per-type LUFS targets
type: project
---

Volume in `MixerVersion.overrides[slotId].volume` is moving from linear 0..1 multiplier to dB trim around unity, range [-12, +6], default 0. Stems pre-normalized server-side to per-type LUFS targets (voice -16, music -23, SFX -20 short-term) before user gain.

**Why:** Producers found 0..1 sliders "gimmicky" because hardcoded type defaults (1.0/0.25/0.7) baked stem loudness into the multiplier. Critically, stage-9 variant forks (e.g. Mandarin from English) need volume to port-forward across pinned-voice-version changes — only dB-against-normalized-stem has that property. 0..1 multipliers encode the loudness of one specific stem and break across forks.

**How to apply:**
- Schema: stem version records (VoiceVersion/MusicVersion/SfxVersion) store `integratedLufs` (the raw measurement, not the gain) so target LUFS can be retuned later without re-measuring.
- Computation site: server-side at stem generation, on the URL-intercept → Vercel Blob persistence path. Not client-side at mix time (would re-run ~100ms per stem on every preview, multiplied for stage-9 A/B compare).
- Mix render: reads `integratedLufs`, computes gain to per-type target, applies user dB trim as `Math.pow(10, dB/20)`. Final BS.1770 pass at -16 LUFS stays as safety net.
- No schema `unit` tag. Migrate `volume` field meaning in place; one-shot migration of existing values; stale untouched values render bounded-wrong until first slider touch.
- Per-type target LUFS should be config, not constants — producers will tune.
- UI: per-clip slider moves into ribbon kebab with dB readout. Stage-9 A/B compare will need always-visible compact dB readout per ribbon (click-to-edit) so both takes are simultaneously adjustable; kebab stays as verbose editor.
- Lazy LUFS backfill for stems generated before this change.

Decided 2026-04-24 during volume-control architecture review.
