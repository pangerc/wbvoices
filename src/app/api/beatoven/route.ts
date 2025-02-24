import { NextResponse } from "next/server";

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
    const { prompt } = body;

    console.log("Creating Beatoven composition with prompt:", prompt);

    // Create composition
    const createResponse = await fetch(`${BEATOVEN_API_URL}/v1/compositions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BEATOVEN_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: {
          text: prompt,
        },
        duration: 30, // 30 seconds default
      }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.json();
      return NextResponse.json(
        { error: error.message || "Failed to create composition" },
        { status: createResponse.status }
      );
    }

    const { project_id, track_id } = await createResponse.json();

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 30; // 1 minute maximum waiting time

    while (attempts < maxAttempts) {
      attempts++;
      console.log(
        `Checking composition status (attempt ${attempts}/${maxAttempts})`
      );

      const statusResponse = await fetch(
        `${BEATOVEN_API_URL}/v1/compositions/${project_id}/${track_id}`,
        {
          headers: {
            Authorization: `Bearer ${BEATOVEN_API_KEY}`,
          },
        }
      );

      if (!statusResponse.ok) {
        const error = await statusResponse.json();
        return NextResponse.json(
          { error: error.message || "Failed to check composition status" },
          { status: statusResponse.status }
        );
      }

      const status = await statusResponse.json();
      console.log("Composition status:", status);

      if (status.status === "composed" && status.meta?.track_url) {
        return NextResponse.json({ track_url: status.meta.track_url });
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
