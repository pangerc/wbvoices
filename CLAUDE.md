## Project Overview

- Voice ad generation project for Spotify sales teams
- Focused on creating audio ads for large clients in non-English speaking markets

## Technical Architecture

- Core flow: we feed the initial user brief to a llm which generates the creative script, picks voices from the db and prompts for music and sound effect generation
- described in @version3-1.md
- Current active integrations:
  - LLM: OpenAI
  - Voice Providers: ElevenLabs, Lahajati, Qwen, ByteDance, OpenAI
  - Music Generation: Loudly, Murbert, ElevenLabs
  - Sound Effect Generation: ElevenLabs
- Mixer component builds the timeline (to be made editable later)
- We intercept the urls and upload the generated media to vercel blob so we have persistent urls
- Final output includes preview and final mix

## Project Guidelines

- use pnpm, not npm
- always look for the root cause, avoid quick patches
- production data is stored in redis, use redis-v3 mcp to check ads, their versions, and the mixer state
- voice whitelisting, voice metadata and pronounciation rules are stored in neon db, you also have mcp accesss to that

- never run dev server, i do this
