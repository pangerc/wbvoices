Generating creative copy with gpt4 for elevenlabs...
🗣️ Received 8 voices from SINGLE provider: elevenlabs
=== SYSTEM PROMPT ===
You're a senior creative director about to script another successful radio ad. Your audience loves your natural, fluent style with occasional touches of relatable humor or drama. You have a gift for making brands feel personal and memorable.

As an expert in audio advertising, you specialize in creating culturally authentic, engaging advertisements for global markets. Your scripts never feel corporate or pushy - instead, they sound like conversations between real people who genuinely care about what they're sharing.

You excel at matching voice characteristics to brand personality and target audience demographics, always considering regional dialects, cultural nuances, and local market preferences.

=== USER PROMPT ===
Create a 25-second audio advertisement in Spanish language.

CLIENT BRIEF:
LILLYDOO is a Berlin-born, online-only baby-care brand that ships ridiculously soft, perfume-free diapers (plus wipes & skincare) across most of Europe.

CREATIVE DIRECTION:
We want to promote Lillydoo’s Flexible Subscription saving up to 25%. Possible direction: one parent panics after discovering the last diaper; the other calmly flexes their Lillydoo subscription super-powers—doorstep delivery before you run out, no hidden strings, skin-loving materials.

FORMAT: dialog
Create a dialogue between TWO DIFFERENT voices having a natural conversation about the product/service.
CRITICAL: You MUST select two different voice IDs - never use the same voice twice!
The voices should have contrasting but complementary personalities (e.g., one enthusiastic and one calm, or different genders).
Ensure each voice gets roughly equal speaking time.

AVAILABLE VOICES (showing 8 of 8 voices):
Sara Martin - 1 (id: KHCvMklQZZo0O30ERnVn)
Best for: informative_educational
Age: middle_aged
Accent: castilian

Sara Martin - 3 (id: gD1IexrzCvsXPHUuT0s3)
Best for: conversational
Age: young
Accent: castilian

Fernando Martinez (id: dlGxemPxFMTY7iXagmOj)
Best for: narrative_story
Age: middle_aged
Accent: latin_american

David Martin - 1 (id: Nh2zY9kknu6z4pZy6FhD)
Best for: narrative_story
Age: young
Accent: castilian

Martin Osborne - 2 (id: Vpv1YgvVd6CHIzOTiTt8)
Best for: narrative_story
Age: middle_aged
Accent: castilian

Alberto Rodriguez (id: l1zE9xgNpUTaQCZzpNJa)
Best for: narrative_story
Age: middle_aged
Accent: latin_american

Sofi (id: vqoh9orw2tmOS3mY7D2p)
Best for: social_media
Age: young
Accent: latin_american

Zabra - Commercial Announcer (id: 9XaoraKgpXhItOQktYsV)
Best for: advertisement
Age: young
Accent: latin_american

Note: Total available voices: 8. The voices shown above are a representative sample.

Create a script that:

1. Captures attention in the first 3 seconds
2. Clearly communicates the key message
3. Includes a call-to-action
4. Fits within 25 seconds when read at a natural pace
5. Uses culturally appropriate language and expressions
6. If dialogue format, creates natural conversation flow between two voices
7. Leverages the personality traits of selected voices

IMPORTANT: Music and sound effects descriptions must be written in ENGLISH only, regardless of the target language of the ad script.

EMOTIONAL DIMENSIONS:
For ElevenLabs, choose ONE tone label per voice from this set only:
cheerful | energetic | calm | serious | professional | authoritative | empathetic | warm | fast_read | slow_read

These labels will be converted into numeric voice settings internally (stability, similarity, style, speed).
Also include "use_case" when relevant (e.g., advertisement, narration).

IMPORTANT OUTPUT FORMAT INSTRUCTIONS:
You MUST respond with a valid JSON object following this EXACT structure.
Do not include any markdown formatting, code blocks, or explanation text.
The response must be pure JSON that can be parsed directly.

For dialogue format, use this structure:
{
"script": [
{
"type": "soundfx",
"description": "Sound effect description (in English)",
"playAfter": "start",
"overlap": 0
},
{
"type": "voice",
"speaker": "Voice Name (id: exact_voice_id)",
"text": "What the voice says",
"description": "emotional_tone",
"use_case": "advertisement"
},
{
"type": "voice",
"speaker": "Another Voice Name (id: exact_voice_id)",
"text": "What this voice says",
"description": "different_emotional_tone",
"use_case": "advertisement"
}
],
"music": {
"description": "Description of background music mood and style (in English)",
"playAt": "start",
"fadeIn": 1,
"fadeOut": 2
},
"soundFxPrompts": [
{
"description": "Sound effect description (in English)",
"playAfter": "start",
"overlap": 0
}
]
}

For single voice (ad_read) format:
{
"script": [
{
"type": "voice",
"speaker": "Voice Name (id: exact_voice_id)",
"text": "The complete ad script",
"description": "emotional_tone",
"use_case": "advertisement"
}
],
"music": {
"description": "Description of background music mood and style (in English)",
"playAt": "start",
"fadeIn": 1,
"fadeOut": 2
},
"soundFxPrompts": [
{
"description": "Sound effect description if needed (in English)",
"playAfter": "start",
"overlap": 0
}
]
}

Remember:

- The response must be valid JSON only
- Use exact voice IDs from the available voices list
- Sound effects are optional but can add impact (e.g., bottle opening for beverages, car doors for automotive, baby crying for baby products)
- CRITICAL: Sound effects must be very short (maximum 3 seconds) - they should punctuate, not underlay the entire ad
- Keep sound effects brief and relevant - they should enhance, not overwhelm the voice
- soundFxPrompts array can be empty [] if no sound effects are needed
- Do not add any text before or after the JSON

Music examples by theme (keep the description as short and concise, don't overdo it):

- Baby/parenting products: "soft soothing lullaby", "peaceful piano"
- Automotive: "driving rock anthem", "energetic electronic beat"
- Food/beverage: "upbeat pop music", "cheerful acoustic melody"
- Technology: "modern electronic synthwave", "futuristic ambient sounds"

Sound effect examples by theme (keep the description as short and concise, don't overdo it):

- Baby products: "baby giggling" (1-2s), "baby crying" (2-3s)
- Automotive: "car engine starting" (2s), "car door closing" (1s)
- Food/beverage: "soda can opening" (1s), "sizzling pan" (2s)
- Technology: "notification chime" (1s), "keyboard typing" (2s)
  === END PROMPT DUMP ===
  GET /project/smooth-mountain-974 200 in 101ms
