import { MusicTrack } from "@/types";

export async function generateMusicWithElevenLabs(
  prompt: string,
  duration: number,
  projectId?: string
): Promise<MusicTrack> {
  console.log(`Generating music with ElevenLabs: "${prompt}" (${duration}s)`);

  try {
    // Call our standardized API route (server-side) which has access to env vars
    const response = await fetch("/api/music/elevenlabs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        duration,
        projectId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs Music API error:", errorText);
      throw new Error(`ElevenLabs Music API error: ${response.status} ${errorText}`);
    }

    // Check if response is JSON or audio data
    const contentType = response.headers.get("content-type");
    
    if (contentType?.includes("application/json")) {
      const data = await response.json();
      console.log("ElevenLabs Music API response:", data);

      return {
        id: data.id,
        title: data.title,
        url: data.url,
        duration: data.duration,
        provider: "elevenlabs",
      };
    } else {
      // Fallback: Response is raw audio data
      console.warn("ElevenLabs Music: Received raw audio data, using fallback URL");
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      return {
        id: `elevenlabs-music-${Date.now()}`,
        title: prompt.substring(0, 50) || 'Generated music',
        url: audioUrl,
        duration: duration,
        provider: "elevenlabs",
      };
    }

  } catch (error) {
    console.error("ElevenLabs Music generation failed:", error);
    throw new Error(
      `Failed to generate music with ElevenLabs: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}