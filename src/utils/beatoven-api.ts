import { MusicTrack } from "@/types";

export type BeatovenTaskResponse = {
  status: "composing" | "running" | "composed";
  meta?: {
    project_id: string;
    track_id: string;
    prompt: {
      text: string;
    };
    version: number;
    track_url: string;
    stems_url: {
      bass: string;
      chords: string;
      melody: string;
      percussion: string;
    };
  };
};

/**
 * Generates music using the Beatoven API
 * @param prompt The text prompt describing the music to generate
 * @param duration The duration of the music in seconds
 * @param projectId Optional project ID for organizing blob storage
 * @returns A Promise that resolves to a MusicTrack object or null if generation fails
 */
export async function generateMusic(
  prompt: string,
  duration: number = 60,
  projectId?: string
): Promise<MusicTrack | null> {
  try {
    // Add duration to the prompt for Beatoven
    const enhancedPrompt = `${prompt} (Duration: ${duration} seconds)`;

    const response = await fetch("/api/music/beatoven", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: enhancedPrompt,
        duration,
        projectId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to generate music");
    }

    const data = await response.json();

    if (!data.track_url) {
      throw new Error("No track URL returned from Beatoven API");
    }

    return {
      id: data.track_id || `beatoven-${Date.now()}`,
      title: prompt.substring(0, 30) + (prompt.length > 30 ? "..." : ""),
      url: data.track_url,
      duration: data.duration || duration, // Use API-provided duration if available
      provider: "beatoven",
    };
  } catch (error) {
    console.error("Error generating music with Beatoven:", error);
    return null;
  }
}
