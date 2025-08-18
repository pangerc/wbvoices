import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { Voice } from "@/types";
import { getLanguageName } from "@/utils/language";

// Initialize OpenAI client with server-side key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // No NEXT_PUBLIC_ prefix
});


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
    console.log(
      `🗣️ Received ${filteredVoices.length} voices from SINGLE provider: ${provider}`
    );

    // Build provider-specific STYLE instructions
    let styleInstructions = "";

    switch (provider) {
      case "lovo":
        styleInstructions = `Lovo voices have styles built into the voice selection (e.g., "Ava (Cheerful)" vs "Ava (Serious)"). The emotional style is already encoded in the voice ID you choose - no additional style parameter is needed or used by the API.`;
        break;
      case "openai":
        styleInstructions = `OpenAI voices support advanced voice control through detailed instructions. You can control:
- Emotional range (cheerful, confident, dramatic, authoritative, warm, whispering, etc.)
- Accent and pronunciation (specify regional accents, clear articulation)
- Intonation and tone (professional, conversational, promotional, serious)
- Speaking pace and emphasis (energetic delivery, measured pace, emphasis on key words)
- Special techniques (whispering for intimacy, authoritative for credibility)

For each voice in your response, include a "voiceInstructions" field with detailed guidance like:
"Speak in a confident, promotional tone with slight excitement. Use clear articulation and a professional pace suitable for radio advertising. Emphasize key product benefits with warmth and credibility."`;
        break;
      case "elevenlabs":
        styleInstructions = `For each voice, you MUST choose ONE tone from this complete list:
cheerful | happy | excited | energetic | dynamic | calm | gentle | soothing | serious | professional | authoritative | empathetic | warm | fast_read | slow_read

Include this as "description" field (REQUIRED).`;
        break;
      default:
        styleInstructions = "";
    }

    // Use ALL filtered voices - LLM needs complete catalog to make informed choices

    const voiceOptions = (filteredVoices as Voice[])
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

    // Convert language code to readable name for LLM
    const languageName = getLanguageName(language);

    const userPrompt = `Create a ${duration}-second audio advertisement in ${languageName} language.

CLIENT BRIEF:
${clientDescription}

CREATIVE DIRECTION:
${creativeBrief}

FORMAT: ${campaignFormat}
${formatGuide}

AVAILABLE VOICES (${filteredVoices.length} voices):
${voiceOptions}

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
You MUST respond with a valid JSON object with this structure:
{
  "script": [
    {
      "type": "voice",
      "speaker": "Voice Name (id: exact_voice_id)",
      "text": "What the voice says"${
        provider === "openai"
          ? ',\n      "voiceInstructions": "Detailed voice delivery instructions"'
          : provider === "elevenlabs"
          ? ',\n      "description": "cheerful"'
          : ""
      }
    }${campaignFormat === "dialog" ? `,
    {
      "type": "voice", 
      "speaker": "Different Voice Name (id: different_voice_id)",
      "text": "What this voice says"${
        provider === "openai"
          ? ',\n      "voiceInstructions": "Different voice instructions"'
          : provider === "elevenlabs"
          ? ',\n      "description": "serious"'
          : ""
      }
    }` : ""}
  ],
  "music": {
    "description": "Background music description (in English)",
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
- Technology: "notification chime" (1s), "keyboard typing" (2s)`;

    // Map selected model to OpenAI API model name
    const model = aiModel === "gpt5" ? "gpt-5" : "gpt-4.1";
    const temperature = aiModel === "gpt5" ? 1 : 0.7;


    const completionParams: any = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
    };

    // Use max_completion_tokens for GPT-5, max_tokens for other models
    if (aiModel === "gpt5") {
      completionParams.max_completion_tokens = 10000; // Higher limit for GPT-5 reasoning + output
    } else {
      completionParams.max_tokens = 2000;
    }

    const response = await openai.chat.completions.create(completionParams);

    console.log("OpenAI response status:", response);
    console.log("Response choices:", response.choices?.length);
    
    const content = response.choices[0]?.message?.content || "";
    console.log("Raw OpenAI response content:", JSON.stringify(content));
    console.log("Content length:", content.length);

    if (!content || content.trim() === "") {
      console.error("Empty response from OpenAI");
      throw new Error("AI returned empty response");
    }

    // Clean up the response if it contains markdown
    let cleanedContent = content.trim();
    if (cleanedContent.startsWith("```")) {
      cleanedContent = cleanedContent
        .replace(/^```(?:json)?\s*\n/, "")
        .replace(/\n```\s*$/, "");
    }

    console.log("Cleaned content:", JSON.stringify(cleanedContent));

    // Validate it's valid JSON
    try {
      const parsed = JSON.parse(cleanedContent);
      console.log("Successfully parsed JSON:", parsed);
    } catch (jsonError) {
      console.error("Invalid JSON response:", cleanedContent);
      console.error("JSON parse error:", jsonError);
      throw new Error(`AI returned invalid JSON format: ${jsonError instanceof Error ? jsonError.message : 'Unknown parsing error'}`);
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
