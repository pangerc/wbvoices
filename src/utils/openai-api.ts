import OpenAI from "openai";
import { Voice } from "@/types";

const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true, // Since we're calling from the client
});

export async function generateCreativeCopy(
  language: string,
  clientDescription: string,
  creativeBrief: string,
  campaignFormat: string,
  availableVoices: Voice[]
): Promise<string> {
  const voiceOptions = availableVoices
    .map((voice) => {
      let voiceDescription = `${voice.name} (${voice.gender || "unknown"}, ID: ${voice.id})`;
      
      // Add rich personality data for LLM decision-making
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

  const systemPrompt = `You are an expert marketing copywriter with years of experience in audio advertising. 
You excel at creating engaging, conversational copy that resonates with audiences while maintaining brand voice and message clarity.
Your task is to create a compelling audio advertisement that fits within a 60-second time constraint.`;

  const userPrompt = `Create an audio advertisement with the following specifications:

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
TIME LIMIT: 60 seconds

AVAILABLE VOICES:
${voiceOptions}

Please create the ad and return it in the following XML format:

<creative>
  <script>
    <segment>
      <voice id="[voice_id]" style="[emotional_style]" use_case="[use_case]">[spoken text in ${language}]</voice>
    </segment>
    <!-- Add more segments for dialog format -->
  </script>
  <music>
    <prompt>[descriptive prompt for background music in English, describing the style, genre, mood, and tempo. Include a duration that matches the ad length.]</prompt>
  </music>
</creative>

IMPORTANT VOICE SELECTION GUIDELINES:
- Choose voice(s) that best match the brand's tone, message, and target audience
- Use the personality descriptions to match voice character to content needs
- For Lovo voices with available styles, specify the most appropriate emotional style (e.g., "confident", "casual", "serious")  
- For ElevenLabs voices, specify the best use_case (e.g., "advertisement", "narration", "conversational")
- For dialog format, select voices with contrasting personalities to create engaging conversation
- CRITICAL: For dialogue, you MUST use different voice IDs for each speaker - never reuse the same voice
- Consider age and accent appropriateness for the target audience

For dialog format, create multiple segments with different voices (must use different voice IDs). For single voice ad read, use one voice throughout.
Ensure the copy fits within 60 seconds (approximately 150-160 words).
The music prompt must be in English regardless of the ad language.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    });

    return completion.choices[0].message.content || "";
  } catch (error) {
    console.error("Error generating creative copy:", error);
    throw new Error("Failed to generate creative copy");
  }
}
