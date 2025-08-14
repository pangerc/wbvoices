## Project Overview

- Voice ad generation project for Spotify sales teams
- Focused on creating audio ads for large clients in non-English speaking markets

## Technical Architecture

- Core flow: we feed the initial user brief to a llm which generates the creative script, picks voices from the db and prompts for music and sound effect generation
- Current active integrations:
  - LLM: OpenAI
  - Voice Providers:
    - ElevenLabs (better quality)
    - Lovo (more coverage in exotic languages like Balkans and Baltics)
  - Music Generation:
    - Loudly (better quality but more expensive)
    - Murbert (alternative option)
- Mixer component builds the timeline (to be made editable later)
- Except for Loudly, we intercept the urls and upload the generated media to vercel blob so we have persistent urls
- Final output includes preview and final mix
- Full desccription is in docs/aug25-architecture-overview.md

## Current Project Weaknesses

- Timing the clips: LLM tries to provide directions in the resulting JSON, but this approach is too rigid and fragile

## Project Guidelines

- use pnpm, not npm
- always look for the root cause, avoid quick patches

- never run dev server, i do this