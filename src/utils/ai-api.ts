import OpenAI from "openai";
import { Voice, AIModel } from "@/types";

// Initialize the OpenAI client
const openaiClient = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true, // Since we're calling from the client
});

// Initialize the DeepSeek client using the OpenAI SDK
const deepseekClient = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_DEEPSEEK_API || "",
  baseURL: "https://api.deepseek.com",
  dangerouslyAllowBrowser: true, // Since we're calling from the client
});

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

  const voiceOptions = filteredVoices
    .map(
      (voice) => `${voice.name} (${voice.gender || "unknown"}, ID: ${voice.id})`
    )
    .join("\n");

  // Determine which client to use based on the selected AI model
  if (aiModel === "deepseek") {
    return generateWithDeepSeek(
      language,
      clientDescription,
      creativeBrief,
      campaignFormat,
      filteredVoices,
      voiceOptions,
      duration
    );
  } else {
    // Default to OpenAI GPT-4 for all other models (for now)
    // In the future, we can add support for other models like Gemini
    return generateWithOpenAI(
      language,
      clientDescription,
      creativeBrief,
      campaignFormat,
      filteredVoices,
      voiceOptions,
      duration
    );
  }
}

// OpenAI implementation
async function generateWithOpenAI(
  language: string,
  clientDescription: string,
  creativeBrief: string,
  campaignFormat: string,
  filteredVoices: Voice[],
  voiceOptions: string,
  duration: number
): Promise<string> {
  const systemPrompt = `You are an expert marketing copywriter with years of experience in audio advertising. 
You excel at creating engaging, conversational copy that resonates with audiences while maintaining brand voice and message clarity.
Your task is to create a compelling audio advertisement that fits within a ${duration}-second time constraint.`;

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
TIME LIMIT: ${duration} seconds

AVAILABLE VOICES FOR ${language}:
${voiceOptions}

IMPORTANT: You MUST return your response in the following XML format EXACTLY as shown:

<creative>
  <script>
    <segment>
      <voice id="[voice_id]">[spoken text in ${language}]</voice>
    </segment>
    <!-- Add more segments for dialog format -->
  </script>
  <music>
    <prompt>[descriptive prompt for background music in English, describing the style, genre, mood, and tempo. Include a duration of ${duration} seconds that matches the ad length.]</prompt>
  </music>
</creative>

CRITICAL: The voice_id MUST be an exact match to one of the IDs provided in the AVAILABLE VOICES list above. These are the only voices available for ${language}. Do not make up voice IDs or use voices not in this list.

For dialog format, create multiple segments with different voices from the provided list. For single voice ad read, use one voice throughout.
Ensure the copy fits within ${duration} seconds (approximately ${Math.round(
    duration * 2.5
  )}-${Math.round(duration * 2.7)} words).
Choose voice(s) from the provided list that best match the brand's tone and message.
The music prompt must be in English regardless of the ad language.

DO NOT include any explanations, markdown formatting, or additional text outside the XML structure.`;

  try {
    console.log("Making API call to OpenAI...");
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o", // Using GPT-4o for best results
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    });

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

// DeepSeek implementation
async function generateWithDeepSeek(
  language: string,
  clientDescription: string,
  creativeBrief: string,
  campaignFormat: string,
  filteredVoices: Voice[],
  voiceOptions: string,
  duration: number
): Promise<string> {
  const systemPrompt = `You are an expert marketing copywriter with years of experience in audio advertising. 
You excel at creating engaging, conversational copy that resonates with audiences while maintaining brand voice and message clarity.
Your task is to create a compelling audio advertisement that fits within a ${duration}-second time constraint.
You MUST return your response in valid XML format as specified in the user's instructions.
CRITICAL: You must ONLY use voice IDs from the provided list of available voices. Do not make up or invent voice IDs.`;

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
TIME LIMIT: ${duration} seconds

AVAILABLE VOICES FOR ${language}:
${voiceOptions}

IMPORTANT: You MUST return your response in the following XML format EXACTLY as shown:

<creative>
  <script>
    <segment>
      <voice id="[voice_id]">[spoken text in ${language}]</voice>
    </segment>
    <!-- Add more segments for dialog format -->
  </script>
  <music>
    <prompt>[descriptive prompt for background music in English, describing the style, genre, mood, and tempo. Include a duration of ${duration} seconds that matches the ad length.]</prompt>
  </music>
</creative>

CRITICAL: The voice_id MUST be an exact match to one of the IDs provided in the AVAILABLE VOICES list above. These are the only voices available for ${language}. Do not make up voice IDs or use voices not in this list.

For dialog format, create multiple segments with different voices from the provided list. For single voice ad read, use one voice throughout.
Ensure the copy fits within ${duration} seconds (approximately ${Math.round(
    duration * 2.5
  )}-${Math.round(duration * 2.7)} words).
Choose voice(s) from the provided list that best match the brand's tone and message.
The music prompt must be in English regardless of the ad language.

DO NOT include any explanations, markdown formatting, or additional text outside the XML structure.`;

  try {
    console.log("Making API call to DeepSeek...");
    const completion = await deepseekClient.chat.completions.create({
      model: "deepseek-reasoner", // Using deepseek-reasoner as it handles XML well
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    });

    console.log("DeepSeek API call successful!");
    let responseContent = completion.choices[0].message.content || "";
    console.log("DeepSeek API response content:", responseContent);

    // Handle markdown code blocks
    if (responseContent.includes("```xml")) {
      console.log("Found XML code block, extracting content");
      const xmlMatch = responseContent.match(/```xml\s*([\s\S]*?)\s*```/);
      if (xmlMatch && xmlMatch[1]) {
        responseContent = xmlMatch[1].trim();
        console.log("Extracted XML content:", responseContent);
      }
    } else if (responseContent.includes("```")) {
      const codeMatch = responseContent.match(/```\s*([\s\S]*?)\s*```/);
      if (codeMatch && codeMatch[1]) {
        console.log("Extracted content from generic code block");
        responseContent = codeMatch[1].trim();
      }
    }

    // Fix escaped quotes in the XML
    responseContent = responseContent.replace(/\\"/g, '"');
    console.log("After fixing escaped quotes:", responseContent);

    // Fix for escaped quotes in voice ID attributes
    if (
      responseContent.includes("<voice id=\\") ||
      responseContent.includes('<voice id="\\')
    ) {
      console.log("Detected escaped quotes in voice ID, applying direct fix");
      responseContent = responseContent.replace(
        /<voice id=\\+"([^"]+)\\+">/g,
        '<voice id="$1">'
      );
    }

    // Check if the response contains the expected XML structure
    if (
      !responseContent.includes("<creative>") ||
      !responseContent.includes("</creative>")
    ) {
      console.warn("DeepSeek response does not contain proper XML structure");

      // Try to fix the response if possible
      if (
        responseContent.includes("<voice") &&
        responseContent.includes("</voice>")
      ) {
        console.log("Attempting to fix incomplete XML structure...");
        const fixedResponse = `<creative>
  <script>
    ${responseContent.includes("<segment>") ? "" : "<segment>"}
    ${responseContent}
    ${responseContent.includes("</segment>") ? "" : "</segment>"}
  </script>
  <music>
    <prompt>Background music that matches the tone of the advertisement, approximately ${duration} seconds in duration.</prompt>
  </music>
</creative>`;
        console.log("Fixed response:", fixedResponse);
        return fixedResponse;
      } else {
        // If we can't find voice tags, try to create a basic structure
        console.log("Creating basic XML structure from text response");
        // Find a voice ID from the available voices
        const voiceId =
          filteredVoices.length > 0 ? filteredVoices[0].id : "default_voice_id";

        const basicResponse = `<creative>
  <script>
    <segment>
      <voice id="${voiceId}">${responseContent}</voice>
    </segment>
  </script>
  <music>
    <prompt>Background music that matches the tone of the advertisement, approximately ${duration} seconds in duration.</prompt>
  </music>
</creative>`;
        console.log("Created basic XML structure:", basicResponse);
        return basicResponse;
      }
    }

    return responseContent;
  } catch (error) {
    console.error("Error generating creative copy with DeepSeek:", error);

    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes("API key")) {
        throw new Error("DeepSeek API key is invalid or missing");
      } else if (error.message.includes("model")) {
        throw new Error("DeepSeek model not found or unavailable");
      } else {
        throw new Error(`DeepSeek API error: ${error.message}`);
      }
    }

    throw new Error("Failed to generate creative copy with DeepSeek");
  }
}
