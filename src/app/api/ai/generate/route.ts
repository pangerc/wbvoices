import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { Voice } from "@/types";

// Initialize OpenAI client with server-side key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // No NEXT_PUBLIC_ prefix
});

// Utility function to shuffle an array (Fisher-Yates algorithm)
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      aiModel,
      language,
      clientDescription,
      creativeBrief,
      campaignFormat,
      filteredVoices,
      duration = 60,
      provider,
    } = body;

    // Validate required fields
    if (
      !language ||
      !clientDescription ||
      !creativeBrief ||
      !campaignFormat ||
      !filteredVoices
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    console.log(`Generating creative copy with ${aiModel} for ${provider}...`);

    // Build provider-specific style instructions
    let styleInstructions = "";

    switch (provider) {
      case "lovo":
        styleInstructions = `Each voice may have style variants listed (e.g., "Narrative", "Cheerful"). Include the appropriate style in your response.`;
        break;
      case "openai":
        styleInstructions = `Voices support emotional styles like "cheerful", "excited", "whispering". Choose appropriate styles for the content.`;
        break;
      case "elevenlabs":
        styleInstructions = `Voices can have emotional settings. Use descriptive styles like "enthusiastic", "professional", "warm" when appropriate.`;
        break;
      default:
        styleInstructions = "";
    }

    // Sample 8 voices from the filtered list for format presentation
    const sampleSize = Math.min(8, filteredVoices.length);
    const sampledVoices = shuffleArray(filteredVoices).slice(0, sampleSize);

    const voiceOptions = (sampledVoices as Voice[])
      .map((voice: Voice) => {
        let voiceDescription = `${voice.name} (id: ${voice.id})`;

        // Add rich personality data
        if (voice.description) {
          voiceDescription += `\n  Personality: ${voice.description}`;
        }
        if (voice.use_case) {
          voiceDescription += `\n  Best for: ${voice.use_case}`;
        }
        if (voice.age) {
          voiceDescription += `\n  Age: ${voice.age}`;
        }
        if (voice.accent && voice.accent !== "general") {
          voiceDescription += `\n  Accent: ${voice.accent}`;
        }
        if (voice.style && voice.style !== "Default") {
          voiceDescription += `\n  Available styles: ${voice.style}`;
        }

        return voiceDescription;
      })
      .join("\n\n");

    const formatGuide =
      campaignFormat === "dialog"
        ? `Create a dialogue between TWO DIFFERENT voices having a natural conversation about the product/service.
CRITICAL: You MUST select two different voice IDs - never use the same voice twice!
The voices should have contrasting but complementary personalities (e.g., one enthusiastic and one calm, or different genders).
Ensure each voice gets roughly equal speaking time.`
        : `Create a single-voice narration that directly addresses the listener.
The voice should maintain consistent tone throughout.`;

    const systemPrompt = `You're a senior creative director about to script another successful radio ad. Your audience loves your natural, fluent style with occasional touches of relatable humor or drama. You have a gift for making brands feel personal and memorable.

As an expert in audio advertising, you specialize in creating culturally authentic, engaging advertisements for global markets. Your scripts never feel corporate or pushy - instead, they sound like conversations between real people who genuinely care about what they're sharing.

You excel at matching voice characteristics to brand personality and target audience demographics, always considering regional dialects, cultural nuances, and local market preferences.`;

    const userPrompt = `Create a ${duration}-second audio advertisement in ${language}.

CLIENT BRIEF:
${clientDescription}

CREATIVE DIRECTION:
${creativeBrief}

FORMAT: ${campaignFormat}
${formatGuide}

AVAILABLE VOICES (showing ${sampleSize} of ${filteredVoices.length} voices):
${voiceOptions}

Note: Total available voices: ${
      filteredVoices.length
    }. The voices shown above are a representative sample.

Create a script that:
1. Captures attention in the first 3 seconds
2. Clearly communicates the key message
3. Includes a call-to-action
4. Fits within ${duration} seconds when read at a natural pace
5. Uses culturally appropriate language and expressions
6. If dialogue format, creates natural conversation flow between two voices
7. Leverages the personality traits of selected voices

IMPORTANT: Music and sound effects descriptions must be written in ENGLISH only, regardless of the target language of the ad script.

${
  styleInstructions
    ? `EMOTIONAL DIMENSIONS:
${styleInstructions}
`
    : ""
}
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
      "text": "What the voice says"${
        styleInstructions ? ',\n      "style": "appropriate_style"' : ""
      }
    },
    {
      "type": "voice", 
      "speaker": "Another Voice Name (id: exact_voice_id)",
      "text": "What this voice says"${
        styleInstructions ? ',\n      "style": "appropriate_style"' : ""
      }
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
      "text": "The complete ad script"${
        styleInstructions ? ',\n      "style": "appropriate_style"' : ""
      }
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

Music examples by theme:
- Baby/parenting products: "soft soothing lullaby", "gentle nursery rhyme melody", "calm acoustic guitar"
- Automotive: "driving rock anthem", "energetic electronic beat"
- Food/beverage: "upbeat pop music", "cheerful acoustic melody"
- Technology: "modern electronic synthwave", "futuristic ambient sounds"

Sound effect examples by theme:
- Baby products: "baby giggling" (1-2s), "baby crying" (2-3s), "gentle rattle shake" (1s)
- Automotive: "car engine starting" (2s), "car door closing" (1s)
- Food/beverage: "soda can opening" (1s), "sizzling pan" (2s)
- Technology: "notification chime" (1s), "keyboard typing" (2s)`;

    const model = aiModel === "o3" ? "o3" : "gpt-4.1";
    const temperature = aiModel === "o3" ? 1 : 0.7;

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content || "";
    console.log("Raw OpenAI response:", content);

    // Clean up the response if it contains markdown
    let cleanedContent = content.trim();
    if (cleanedContent.startsWith("```")) {
      cleanedContent = cleanedContent
        .replace(/^```(?:json)?\s*\n/, "")
        .replace(/\n```\s*$/, "");
    }

    // Validate it's valid JSON
    try {
      JSON.parse(cleanedContent);
    } catch {
      console.error("Invalid JSON response:", cleanedContent);
      throw new Error("AI returned invalid JSON format");
    }

    return NextResponse.json({ content: cleanedContent });
  } catch (error) {
    console.error("Error in AI generation:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate creative copy",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
