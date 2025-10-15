=== SYSTEM PROMPT ===
You're a senior creative director about to script another successful radio ad. Your audience loves your natural, fluent style with occasional touches of relatable humor or drama. You have a gift for making brands feel personal and memorable.

As an expert in audio advertising, you specialize in creating culturally authentic, engaging advertisements for global markets. Your scripts never feel corporate or pushy - instead, they sound like conversations between real people who genuinely care about what they're sharing.

You excel at matching voice characteristics to brand personality and target audience demographics, always considering regional dialects, cultural nuances, and local market preferences.

=== USER PROMPT ===
Create a 20-second audio advertisement in Spanish language.

CLIENT BRIEF:
cocacola

CREATIVE DIRECTION:
hot girl gets a cool drink

FORMAT: dialog
Create a dialogue between TWO DIFFERENT voices having a natural conversation about the product/service.
CRITICAL: You MUST select two different voice IDs - never use the same voice twice!
The voices should have contrasting but complementary personalities (e.g., one enthusiastic and one calm, or different genders).
Ensure each voice gets roughly equal speaking time.

AVAILABLE VOICES (showing 8 of 79 voices):
Alex de Santos (id: 63b40870241a82001d51c390)
Personality: default
Best for: general
Age: young
Accent: puerto_rican

Emiliano Delgado (id: 63b40822241a82001d51c2c8)
Personality: default
Best for: general
Age: middle_aged
Accent: castilian

Luis Ramon (id: 63b40881241a82001d51c3be)
Personality: default
Best for: general
Age: young
Accent: uruguayan

Manuel Rojos (id: 63b40888241a82001d51c3d0)
Personality: default
Best for: general
Age: young
Accent: venezuelan

Hector Gavi (id: 63b4080c241a82001d51c283)
Personality: default
Best for: general
Age: middle_aged
Accent: castilian

Eva Gallego (id: 64e2f74d36fe21ca612f15f7)
Personality: default
Best for: general
Age: middle_aged
Accent: castilian

Liberto Marcos (id: 63b40866241a82001d51c378)
Personality: default
Best for: general
Age: middle_aged
Accent: panamanian

Marisol Guerrero (id: 64e2f74b36fe21ca612f15eb)
Personality: default
Best for: general
Age: middle_aged
Accent: american

Note: Total available voices: 79. The voices shown above are a representative sample.

Create a script that:

1. Captures attention in the first 3 seconds
2. Clearly communicates the key message
3. Includes a call-to-action
4. Fits within 20 seconds when read at a natural pace
5. Uses culturally appropriate language and expressions
6. If dialogue format, creates natural conversation flow between two voices
7. Leverages the personality traits of selected voices

IMPORTANT: Music and sound effects descriptions must be written in ENGLISH only, regardless of the target language of the ad script.

EMOTIONAL DIMENSIONS:
Each voice may have style variants listed (e.g., "Narrative", "Cheerful"). Include the appropriate style in your response.

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
"style": "Confident"
},
{
"type": "voice",
"speaker": "Another Voice Name (id: exact_voice_id)",
"text": "What this voice says",
"style": "Serious"
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
"style": "Confident"
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
