import OpenAI from "openai";
import { Voice, AIModel } from "@/types";

// Initialize the OpenAI client
const openaiClient = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true, // Since we're calling from the client
});


// Utility function to shuffle an array (Fisher-Yates algorithm)
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]; // Create a copy to avoid mutating the original
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; // Swap elements
  }
  return shuffled;
}

export async function generateCreativeCopy(
  aiModel: AIModel,
  language: string,
  clientDescription: string,
  creativeBrief: string,
  campaignFormat: string,
  filteredVoices: Voice[],
  duration: number = 60
): Promise<string> {
  console.log(`Generating creative copy with ${aiModel}...`);

  // Ensure we only use voices that match the target language
  const languageVoices = filteredVoices.filter(
    (voice) => voice.language?.toLowerCase() === language.toLowerCase()
  );

  console.log(
    `Filtered to ${languageVoices.length} voices for language: ${language}`
  );

  if (languageVoices.length === 0) {
    console.warn(
      `No voices found for language: ${language}, using all provided voices as fallback`
    );
    // Fall back to all voices if none match the target language
    languageVoices.push(...filteredVoices);
  }

  // Randomize the order of voices to encourage different selections
  const randomizedVoices = shuffleArray(languageVoices);

  // Enhanced voice descriptions with more detailed attributes
  const voiceOptions = randomizedVoices
    .map(
      (voice) => `${voice.name} (id: ${voice.id})
  • Gender: ${voice.gender ?? "unknown"}
  • Age: ${voice.age ?? "n/a"}
  • Accent: ${voice.accent ?? voice.language}
  • Tone: ${voice.description ?? voice.style ?? "neutral"}
  • Use case: ${voice.use_case ?? "general"}
`
    )
    .join("\n");

  // Use OpenAI for both GPT-4.1 and o3 models
  return generateWithOpenAI(
    aiModel,
    language,
    clientDescription,
    creativeBrief,
    campaignFormat,
    randomizedVoices, // Pass the randomized voices
    voiceOptions,
    duration
  );
}

// Function to create the base system prompt
function createBaseSystemPrompt(duration: number): string {
  return `You are an expert marketing copywriter with years of experience in audio advertising. 
You excel at creating engaging, conversational copy that resonates with audiences while maintaining brand voice and message clarity.
Your task is to create a compelling audio advertisement that fits within a ${duration}-second time constraint.
When selecting voices, analyze the voice descriptions to match personalities with the right roles. Don't pick Drew as the English voice every time. 
When appropriate, include sound effects to enhance the listener experience, especially for scenarios like cars, technology, or nature.
IMPORTANT: All music and sound effect descriptions MUST be written in English, regardless of the target language for the ad voices.
CRITICAL INSTRUCTION: When creating dialogue between two speakers, you MUST assign different voice IDs to each speaker. Do not assign the same voice ID to multiple speakers, as this would make the dialogue confusing and unrealistic.`;
}

// Function to create the user prompt
function createUserPrompt(
  language: string,
  clientDescription: string,
  creativeBrief: string,
  campaignFormat: string,
  voiceOptions: string,
  duration: number
): string {
  return `Create an audio advertisement with the following specifications:

LANGUAGE: ${language}

CLIENT INFORMATION:
${clientDescription}

CREATIVE BRIEF:
${creativeBrief}

FORMAT: ${
    campaignFormat === "ad_read"
      ? "Single voice ad read"
      : "Dialog between two voices"
  }
TIME LIMIT: ${duration} seconds

AVAILABLE VOICES FOR ${language}:
${voiceOptions}

IMPORTANT: You MUST return your response in the following JSON format:

{
  "script": [
    {
      "type": "voice",
      "speaker": "Voice_ID_Here",  // MUST match one of the voice IDs in AVAILABLE VOICES
      "text": "The spoken text in ${language}"
    },
    // SOUND EFFECTS (REQUIRED FOR CAR/TECHNOLOGY/PRODUCT ADS)
    {
      "type": "soundfx",  
      "description": "Super short description of the sound effect in ENGLISH ONLY, few words only (e.g., 'car engine revving', 'phone notification', 'door opening')",
      "playAfter": "previous",  // Can be "previous" OR the ID of a specific voice element
      "overlap": 0.5  // Seconds to overlap with previous element (use 0 for sequential play)
    },
    // You can also specify concurrent voices like this:
    {
      "type": "concurrent",  // For simultaneous speaking
      "elements": [
        {
          "type": "voice",
          "speaker": "Voice_ID_Here",
          "text": "First person speaking"
        },
        {
          "type": "voice",
          "speaker": "Another_Voice_ID",
          "text": "Second person speaking simultaneously"
        }
      ]
    }
  ],
  "music": {  // RECOMMENDED - include music to enhance the advertisement's atmosphere
    "description": "Descriptive prompt for background music in ENGLISH ONLY, describing style, genre, mood, and tempo",
    "playAt": "start",  // When music should start playing: "start" (default), "end", or after a specific element
    "fadeIn": 1,  // Optional fade-in in seconds
    "fadeOut": 2  // Optional fade-out in seconds
  },
  "soundFxPrompts": [  // INCLUDE AT LEAST ONE SOUND EFFECT PROMPT FOR ANY PRODUCT, CAR, OR TECH AD
    {
      "description": "Detailed description of a sound effect to generate in ENGLISH ONLY (e.g., 'Electric car engine starting with futuristic hum')",
      "playAfter": "element ID or 'previous' or 'start'",  // Timing instruction - use 'start' for intro effects!
      "overlap": 0.5  // How much it should overlap with previous element (in seconds)
    }
  ]
}

CRITICAL INSTRUCTIONS:
1. The "speaker" MUST be an exact voice ID from the AVAILABLE VOICES list above
2. For "Dialog between two voices", you MUST output exactly two different "speaker" IDs! THIS IS A MANDATORY REQUIREMENT! NEVER USE THE SAME VOICE ID FOR MULTIPLE SPEAKERS!
3. Prefer contrast: at least one of {gender, age, accent, tone} should differ across speakers.
4. If no ideal personality match is obvious, pick randomly from the remaining unused voices rather than picking the obvious choice.
5. If available, use the "Tone" and "Use case" tags to justify your picks (e.g., an "authoritative" middle-aged male for a narrator vs. a "youthful upbeat" female as a customer).
6 . For voice elements, focus on realistic dialog and natural speech patterns
7. Include sound effects for themed content (e.g., car sounds for automotive ads, nature sounds for outdoor products)
8. "playAfter" indicates what element this should play after (usually "previous")
9. "overlap" is the number of seconds an element should overlap with what it plays after
10. For dialog format, VARY your voice choices based on message content and voice personalities
11. Ensure the script fits within ${duration} seconds (approximately ${Math.round(
    duration * 2.5
  )}-${Math.round(duration * 2.7)} words)
12. Whenever appropriate, include the "soundFxPrompts" array with at least one detailed sound effect description for car/tech/product ads
13. CRUCIAL: ALL music and sound effect descriptions must be in ENGLISH ONLY, regardless of the ad language

SOUND EFFECT PROMPTING:
14. SIMPLE EFFECTS: Use clear, concise descriptions (e.g., "Glass shattering on concrete", "Door creaking open", go for strong recognizable sounds, don't be creative here)
15. COMPLEX SEQUENCES: For multi-part effects, describe the sequence (e.g., "Footsteps on gravel, then a metallic door opens")
16. BE SPECIFIC: Include surface materials, distance, intensity, and environment when relevant
17. AVOID VAGUE TERMS: Instead of "nice" or "cool" sound, describe the actual sound itself
18. DURATION: Short is better, limit to 3 seconds when possible!! API allows duration from 0.1 to 15 seconds

SOUND EFFECT PLACEMENT:
19. CREATIVE PLACEMENT: Position sound effects throughout the ad - not just at the end! Use them at the beginning, middle, and end
20. DRAMATIC INTROS: Consider starting with attention-grabbing sounds BEFORE voices by setting "playAfter": "start"
21. PUNCTUATE DIALOG: Place impactful sound effects between voice segments to emphasize key points
22. LAYERED EXPERIENCE: Overlap voices with relevant sound effects for immersion (e.g., car acceleration while spokesperson talks)
23. CONCLUDING EFFECTS: For ending effects, play them during music fadeout for a professional finish


SOUND EFFECT SAMPLE PROMPTS:
- Delivery: "Doorbell ringing" (no freezer doors and similar abstract sounds)
- Car ads: "Car engine starting with mechanical ignition sound, then revving powerfully" (playAfter: "start")
- Race ad: "Tires screeching on asphalt, followed by powerful acceleration" (during key feature mentions)
- Action: "Dramatic explosion with debris falling, followed by ringing silence" (playAfter: "start")
- Tech products: "Crisp notification chime, followed by app startup sound" (between feature points)
- Food/beverage: "Bottle cap twisting open with fizz release, then liquid pouring over ice cubes"
- Retail/Sales: "Cash register drawer opening with bell chime, followed by coins dropping"


DO NOT include any explanations, markdown formatting, or additional text outside the JSON structure.`;
}

// OpenAI implementation
async function generateWithOpenAI(
  aiModel: AIModel,
  language: string,
  clientDescription: string,
  creativeBrief: string,
  campaignFormat: string,
  filteredVoices: Voice[],
  voiceOptions: string,
  duration: number
): Promise<string> {
  const systemPrompt = createBaseSystemPrompt(duration);
  const userPrompt = createUserPrompt(
    language,
    clientDescription,
    creativeBrief,
    campaignFormat,
    voiceOptions,
    duration
  );

  try {
    console.log(`Making API call to OpenAI with model: ${aiModel}...`);
    
    // Map our internal model names to actual OpenAI model names
    const modelName = aiModel === "o3" ? "o3-2025-04-16" : "gpt-4.1";
    
    // o3 model only supports default temperature of 1
    const requestParams: any = {
      model: modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    };
    
    // Only add temperature for non-o3 models
    if (aiModel !== "o3") {
      requestParams.temperature = 0.8;
    }
    
    const completion = await openaiClient.chat.completions.create(requestParams);

    console.log("OpenAI API call successful!");
    const responseContent = completion.choices[0].message.content || "";
    return responseContent;
  } catch (error) {
    console.error("Error generating creative copy with OpenAI:", error);

    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes("API key")) {
        throw new Error("OpenAI API key is invalid or missing");
      } else if (error.message.includes("model")) {
        throw new Error("OpenAI model not found or unavailable");
      } else {
        throw new Error(`OpenAI API error: ${error.message}`);
      }
    }

    throw new Error("Failed to generate creative copy with OpenAI");
  }
}

