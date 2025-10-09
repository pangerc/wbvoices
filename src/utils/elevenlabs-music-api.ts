import { MusicTrack } from "@/types";
import { ErrorDetails } from "@/lib/providers/BaseAudioProvider";

interface ErrorWithDetails extends Error {
  details?: ErrorDetails;
}

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
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      console.error("ElevenLabs Music API error:", errorData);
      const error = new Error(errorData.error || `ElevenLabs Music API error: ${response.status}`) as ErrorWithDetails;
      error.details = errorData.errorDetails;  // Attach structured details (prompt_suggestion, etc.)
      throw error;
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
    const wrappedError = new Error(
      `Failed to generate music with ElevenLabs: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    ) as ErrorWithDetails;
    // Preserve details from original error (prompt_suggestion, etc.)
    const originalError = error as ErrorWithDetails;
    if (originalError.details) {
      wrappedError.details = originalError.details;
    }
    throw wrappedError;
  }
}