import { MusicTrack } from "@/types";

export interface LoudlyTaskResponse {
  id: string;
  title: string;
  duration: number;
  music_file_path: string | null;
  wave_form_file_path: string | null;
  created_at: string;
  bpm: number | null;
  key: string | null;
  ready?: boolean;
}

/**
 * Generates music using the Loudly API
 * @param prompt The text prompt describing the music to generate
 * @param duration The desired duration in seconds
 * @returns A Promise that resolves to a MusicTrack object or null if generation fails
 */
export async function generateMusicWithLoudly(
  prompt: string,
  duration: number
): Promise<MusicTrack | null> {
  try {
    console.log("Generating music with Loudly...");

    // Step 1: Create a new song request using our simplified API
    let createResponse;
    try {
      createResponse = await fetch("/api/loudly", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, duration }),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        try {
          // Try to parse as JSON
          const errorData = JSON.parse(errorText);
          throw new Error(
            errorData.error ||
              `API error: ${createResponse.status} ${createResponse.statusText}`
          );
        } catch {
          // If parsing fails, use the raw text
          throw new Error(
            `API error: ${createResponse.status} ${
              createResponse.statusText
            }. Details: ${errorText.substring(0, 100)}`
          );
        }
      }
    } catch (error) {
      console.error("Error creating music generation task:", error);
      throw new Error(
        error instanceof Error
          ? error.message
          : "Failed to create music generation task"
      );
    }

    let responseData;
    try {
      responseData = await createResponse.json();
      console.log("Initial response data:", responseData);
    } catch (error) {
      console.error("Error parsing response:", error);
      throw new Error("Failed to parse API response");
    }

    if (!responseData.id) {
      throw new Error("No task ID returned from API");
    }

    // If the music_file_path is already available in the initial response, use it directly
    if (responseData.music_file_path) {
      console.log(
        "Music is already generated and available in the initial response!"
      );
      console.log(`Direct music file URL: ${responseData.music_file_path}`);

      // Return the track immediately - no need to poll for status
      return {
        id: responseData.id,
        title: responseData.title || prompt.substring(0, 30) + "...",
        url: responseData.music_file_path, // Direct CDN URL from Loudly
        duration: responseData.duration
          ? responseData.duration / 1000
          : duration, // Convert from ms to seconds
        provider: "loudly",
      };
    }

    // If we reach here, the music wasn't immediately available, so we need to poll
    // This is a fallback and likely won't be needed based on your logs
    const id = responseData.id;
    console.log(
      `Music generation task created with ID: ${id}, but music_file_path not immediately available. Will poll for result.`
    );

    // Step 2: Poll for the result using our API route
    const maxAttempts = 60; // 5 minutes (5s interval)
    const interval = 5000; // 5 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      console.log(`Checking status (attempt ${attempt + 1}/${maxAttempts})...`);

      let statusResponse;
      try {
        // Use our dedicated status API route for status checks
        statusResponse = await fetch(`/api/loudly/status?id=${id}`);
        console.log(`Status response status: ${statusResponse.status}`);

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          console.error(`Error response text: ${errorText}`);
          try {
            // Try to parse as JSON
            const errorData = JSON.parse(errorText);
            throw new Error(
              errorData.error ||
                `API error: ${statusResponse.status} ${statusResponse.statusText}`
            );
          } catch {
            // If parsing fails, use the raw text
            throw new Error(
              `API error: ${statusResponse.status} ${
                statusResponse.statusText
              }. Details: ${errorText.substring(0, 100)}`
            );
          }
        }
      } catch (error) {
        console.error(`Error checking status (attempt ${attempt + 1}):`, error);
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, interval));
        continue; // Try again
      }

      let songData;
      try {
        songData = await statusResponse.json();
        console.log(`Status check data:`, songData);
      } catch (error) {
        console.error(
          `Error parsing status response (attempt ${attempt + 1}):`,
          error
        );
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, interval));
        continue; // Try again
      }

      // Check if the music is ready (music_file_path is present)
      if (songData.music_file_path) {
        console.log("Music generation complete!");
        console.log(`Direct music file URL: ${songData.music_file_path}`);

        // The music_file_path from Loudly API is already a complete CDN URL
        return {
          id: songData.id,
          title: songData.title || prompt.substring(0, 30) + "...",
          url: songData.music_file_path, // Direct CDN URL from Loudly
          duration: songData.duration ? songData.duration / 1000 : duration, // Convert from ms to seconds
          provider: "loudly",
        };
      }

      // Wait before the next attempt
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error("Music generation timed out");
  } catch (error) {
    console.error("Error generating music with Loudly:", error);
    throw error; // Re-throw to let the caller handle it
  }
}
