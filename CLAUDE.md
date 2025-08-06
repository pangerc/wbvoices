## Project Overview
- Voice ad generation project for Spotify sales teams
- Focused on creating audio ads for large clients in non-English speaking markets

## Technical Architecture
- Core flow: we feed the initial user brief to a llm which generates the creative script, picks voices from the db and prompts for music and sound effect generation
- Current active integrations:
  * LLM: OpenAI
  * Voice Providers: 
    - ElevenLabs (better quality)
    - Lovo (more coverage in exotic languages like Balkans and Baltics)
  * Music Generation:
    - Loudly (better quality but more expensive)
    - Beatoven (alternative option)
- Mixer component builds the timeline (to be made editable later)
- Final output includes preview and final mix

## Current Project Weaknesses
- Timing the clips: LLM tries to provide directions in the resulting JSON, but this approach is too rigid and fragile
- Voice selection challenges:
  * Often get the same voice for both sides of dialogue
  * Same voice is chosen too frequently
- Voice and dialect management is messy, with problematic code for accessing and unifying the list of voices