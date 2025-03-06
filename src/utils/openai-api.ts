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
    .map(
      (voice) => `${voice.name} (${voice.gender || "unknown"}, ID: ${voice.id})`
    )
    .join("\n");

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
      <voice id="[voice_id]">[spoken text in ${language}]</voice>
    </segment>
    <!-- Add more segments for dialog format -->
  </script>
  <music>
    <prompt>[descriptive prompt for background music in English, describing the style, genre, mood, and tempo. Include a duration that matches the ad length.]</prompt>
  </music>
</creative>

For dialog format, create multiple segments with different voices. For single voice ad read, use one voice throughout.
Ensure the copy fits within 60 seconds (approximately 150-160 words).
Choose voice(s) from the provided list that best match the brand's tone and message.
The music prompt must be in English regardless of the ad language.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.5-preview",
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
