---
name: Two-pass tag-weaver architecture (Stage M/N)
description: ACA voice pipeline split into pass-1 (agent loop, clean script) + pass-2 (server-side tag-weaver inside createVoiceDraft); known coordination smells
type: project
---

Stage M (prompt module rewrite) + Stage N (server-side `tag-weaver.ts` invoked from `createVoiceDraft`) split ElevenLabs voice production into two passes. Pass 1 = agent loop writes clean prose + casts voices + sets `description` baseline tone. Pass 2 = `src/lib/tools/validation/tag-weaver.ts` makes its own OpenAI call per ElevenLabs track and inserts opening-stack + body tags. Stage L lint (`voice-tag-lint.ts`) checks accent presence, opening-stack ≤ 8, syntax; retries pass 2 once on failure, never blocks.

**Why:** original symptom was tag clustering — every emotional tag piling up at the start of every line, no body weave, accent tag missing despite cast voice carrying e.g. parisian metadata. Diagnosis was that the agent dropped tag-placement craft when juggling dialogue + brand voice + casting + tags simultaneously. A focused single-line transform with cast voice metadata in scope restores it.

**How to apply:**

- The agent prompt must NOT advertise pass 2 as a coordinating actor — that introduced a regression where the model burned 5 iterations doing 9 `search_voices` calls because it was uncertain "what does done look like for pass 1" and over-prepared casting.
- The `create_voice_draft.text` parameter description in `src/lib/tools/definitions.ts` must agree with the pass-1 module on whether inline tags belong in `text` — they currently disagree (definition says "include inline tags", module says "do not"). Either side fixed in isolation will leave the agent reading contradictory instructions.
- `executor.ts`'s zero-result branch for `search_voices` returns `suggestion: "Try broadening your search…"` — this is a feedback loop into MORE searches. If used with prescriptive search budgets, this suggestion should pivot toward "you have enough; pick from prior results or commit with what you have."
- `maxIterations` is set to **5** at both `/api/ai/generate` and `/api/ai/generate-stream` route call sites (NOT 10 as the AgentExecutor default suggests). Any iteration-budget reasoning must use 5.
- pass-2 is ElevenLabs-only. Other providers must skip it (see `tag-weaver.ts` header).
- pass-2 is per-track and runs INSIDE `createVoiceDraft`, so the agent loop does not see its output and cannot react to it. Lint failures retry inside pass 2, not back through the agent.
