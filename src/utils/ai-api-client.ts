import { Voice, AIModel } from "@/types";

export async function generateCreativeCopy(
  aiModel: AIModel,
  language: string,
  clientDescription: string,
  creativeBrief: string,
  campaignFormat: string,
  filteredVoices: Voice[],
  duration: number = 60,
  provider?: string
): Promise<string> {
  try {
    const response = await fetch("/api/ai/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        aiModel,
        language,
        clientDescription,
        creativeBrief,
        campaignFormat,
        filteredVoices,
        duration,
        provider,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to generate creative copy");
    }

    const data = await response.json();
    return data.content;
  } catch (error) {
    console.error("Error calling AI API:", error);
    throw error;
  }
}