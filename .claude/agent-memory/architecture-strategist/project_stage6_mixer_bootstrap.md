---
name: Stage-6 mixer bootstrap semantics
description: Bootstrap force-freeze regression and the resolution path for mixer:v1 pinning a mutable draft
type: project
---

Stage-6 branch `mixer-version-stream` (commit 4b46556) regressed: bootstrap force-freezes active stream drafts when minting mixer:v1, wiping post-generation editability.

**Why:** Force-freeze was designed for legacy mid-iteration drafts at cutover; applied indiscriminately it fires on fresh ads too (their `mixer:versions` list is empty before first GET /mixer).

**How to apply:**

- `src/lib/mixer/bootstrap.ts` lines 147–175 (stream force-freeze) and 240 (`bootstrappedAt` on mixer:v1) are the removal targets.
- The mixer:v1-pins-a-draft window is self-closing: `freezeExistingDraft` (`src/lib/tools/implementations.ts:48`) runs at the start of every `createVoiceDraft`/`createMusicDraft`/`createSfxDraft` — hardening the pin the moment the user starts an iteration.
- `src/lib/mixer/rebuilder.ts:181–197` (`ensureMixerDraftWithCurrentPins`) already forks frozen mixer:v1 → mixer:v2(draft) lazily on the next mixer edit. So "mixer:v1 frozen" is not load-bearing for editability.
- The slot-id backfill in bootstrap mutates frozen stream versions (documented as migration write at bootstrap.ts:22) — so "pinned content is byte-stable" was never a hard invariant.
- Stage-9 variant A/B fork should freeze pinned drafts at fork time — that's where reproducibility belongs, not bootstrap.
- Legacy ads with genuinely stale mid-iteration drafts should be handled via one-shot migration script, not bootstrap side-effect.
