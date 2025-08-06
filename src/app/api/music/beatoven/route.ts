import { NextResponse } from "next/server";
import { uploadMusicToBlob } from "@/utils/blob-storage";

const BEATOVEN_API_KEY = process.env.BEATOVEN_API_KEY;
const BEATOVEN_API_URL = "https://public-api.beatoven.ai";

export async function POST(request: Request) {
  try {
    // Validate API key
    if (!BEATOVEN_API_KEY) {
      console.error("Beatoven API key is not configured");
      return NextResponse.json(
        { error: "Beatoven API is not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { prompt, duration, projectId } = body;

    console.log(`Creating Beatoven track with prompt: ${prompt} (Duration: ${duration} seconds)`);

    // Create track
    const createResponse = await fetch(`${BEATOVEN_API_URL}/api/v1/tracks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BEATOVEN_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: {
          text: prompt,
        },
      }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.json();
      return NextResponse.json(
        { error: error.message || "Failed to create track" },
        { status: createResponse.status }
      );
    }

    const { tracks } = await createResponse.json();
    const track_id = tracks[0]; // Get first track ID

    // Start composition
    const composeResponse = await fetch(
      `${BEATOVEN_API_URL}/api/v1/tracks/compose/${track_id}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${BEATOVEN_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          format: "wav",
          looping: false,
        }),
      }
    );

    if (!composeResponse.ok) {
      const error = await composeResponse.json();
      return NextResponse.json(
        { error: error.message || "Failed to start composition" },
        { status: composeResponse.status }
      );
    }

    const { task_id } = await composeResponse.json();

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 30; // 1 minute maximum waiting time

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`Checking task status (attempt ${attempts}/${maxAttempts})`);

      const statusResponse = await fetch(
        `${BEATOVEN_API_URL}/api/v1/tasks/${task_id}`,
        {
          headers: {
            Authorization: `Bearer ${BEATOVEN_API_KEY}`,
          },
        }
      );

      if (!statusResponse.ok) {
        const error = await statusResponse.json();
        return NextResponse.json(
          { error: error.message || "Failed to check task status" },
          { status: statusResponse.status }
        );
      }

      const status = await statusResponse.json();
      console.log("Task status:", status);

      if (status.status === "composed" && status.meta?.track_url) {
        console.log("Track composition complete, uploading to Vercel Blob...");
        
        try {
          // Upload the temporary S3 URL to permanent Vercel Blob storage
          const blobResult = await uploadMusicToBlob(
            status.meta.track_url,
            prompt,
            'beatoven',
            projectId
          );
          
          console.log(`Successfully uploaded to Vercel Blob: ${blobResult.url}`);
          
          return NextResponse.json({ 
            track_url: blobResult.url,
            original_url: status.meta.track_url, // Keep for debugging
            track_id: status.meta.track_id,
            duration: status.meta.duration 
          });
        } catch (blobError) {
          console.error("Failed to upload to Vercel Blob:", blobError);
          
          // Fallback to original URL if blob upload fails
          console.log("Falling back to original S3 URL");
          return NextResponse.json({ 
            track_url: status.meta.track_url,
            error: "Blob upload failed, using temporary URL",
            track_id: status.meta.track_id,
            duration: status.meta.duration 
          });
        }
      }

      if (status.status === "failed") {
        return NextResponse.json(
          { error: "Music generation failed" },
          { status: 500 }
        );
      }

      // Wait 2 seconds before checking again
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return NextResponse.json(
      { error: "Timeout waiting for music generation" },
      { status: 504 }
    );
  } catch (error) {
    console.error("Error in Beatoven API route:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
