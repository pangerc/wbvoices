import { MusicTrack } from "@/types";
import { ErrorDetails } from "@/lib/providers/BaseAudioProvider";

interface ErrorWithDetails extends Error {
  details?: ErrorDetails;
}

export async function generateMusicWithMubert(
  prompt: string,
  duration: number,
  projectId?: string
): Promise<MusicTrack> {
  console.log(`Generating music with Mubert: "${prompt}" (${duration}s)`);

  try {
    // Call our NEW standardized API route (server-side) which has access to env vars
    const response = await fetch("/api/music/mubert", {
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
      console.error("Mubert API error:", errorData);
      const error = new Error(errorData.error || `Mubert API error: ${response.status}`) as ErrorWithDetails;
      error.details = errorData.errorDetails;  // Attach structured details (character limit, etc.)
      throw error;
    }

    const data = await response.json();
    console.log("Mubert API response:", data);

    // If track is ready immediately, return it
    if (data.url) {
      return {
        id: data.id,
        title: data.title,
        url: data.url,
        duration: data.duration,
        provider: "mubert",
      };
    }

    // If still processing, poll for completion (like Loudly)
    if (data.status === "processing" && data.id) {
      console.log(
        `Mubert track created with ID: ${data.id}, polling for completion...`
      );

      const maxAttempts = 60; // 5 minutes
      const interval = 5000; // 5 seconds

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        console.log(
          `Checking Mubert status (attempt ${attempt + 1}/${maxAttempts})...`
        );

        try {
          // Wait before checking (except first attempt)
          if (attempt > 0) {
            await new Promise((resolve) => setTimeout(resolve, interval));
          }

          const statusResponse = await fetch(
            `/api/music/mubert/status?id=${data.id}&customer_id=${data.customer_id}&access_token=${data.access_token}`
          );

          if (!statusResponse.ok) {
            const errorText = await statusResponse.text();
            console.error(
              `Status check error (attempt ${attempt + 1}):`,
              errorText
            );
            continue;
          }

          const statusData = await statusResponse.json();
          const generation = statusData.data?.generations?.[0];

          if (generation?.status === "done" && generation.url) {
            console.log("🎵 Mubert track generation completed!");

            // Final request to get the processed track with blob URL
            const finalResponse = await fetch("/api/music/mubert", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt,
                duration,
                projectId,
                _internal_ready_url: generation.url,
                _internal_track_id: data.id,
              }),
            });

            if (finalResponse.ok) {
              const finalData = await finalResponse.json();
              return {
                id: finalData.id,
                title: finalData.title,
                url: finalData.url,
                duration: finalData.duration,
                provider: "mubert",
              };
            }

            // Fallback - return direct URL if blob upload fails
            return {
              id: data.id,
              title: prompt.substring(0, 50),
              url: generation.url,
              duration: duration,
              provider: "mubert",
            };
          }

          console.log(`Status: ${generation?.status || "unknown"}`);
        } catch (error) {
          console.error(
            `Error checking status (attempt ${attempt + 1}):`,
            error
          );
        }
      }

      throw new Error("Track generation timed out after 5 minutes");
    }

    throw new Error("No music URL returned from Mubert API");
  } catch (error) {
    console.error("Error generating music with Mubert:", error);
    const wrappedError = new Error(
      error instanceof Error
        ? `Mubert music generation failed: ${error.message}`
        : "Unknown error generating music with Mubert"
    ) as ErrorWithDetails;
    // Preserve details from original error (character limit, validation errors, etc.)
    const originalError = error as ErrorWithDetails;
    if (originalError.details) {
      wrappedError.details = originalError.details;
    }
    throw wrappedError;
  }
}
