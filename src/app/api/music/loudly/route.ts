import { NextRequest, NextResponse } from "next/server";

// POST: Create a new song
export async function POST(request: NextRequest) {
  try {
    const { prompt, duration = 60 } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.LOUDLY_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "API key not configured" },
        { status: 500 }
      );
    }

    console.log(
      `Sending request to Loudly API with prompt: "${prompt}" and duration: ${duration}s`
    );

    // Create FormData
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("duration", duration.toString());
    formData.append("test", "false");

    const response = await fetch(
      "https://soundtracks-dev.loudly.com/b2b/ai/prompt/songs",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "API-KEY": apiKey,
          // Don't set Content-Type for FormData, the browser will set it automatically with the correct boundary
        },
        body: formData,
      }
    );

    console.log(`Loudly API response status: ${response.status}`);

    if (!response.ok) {
      let errorMessage = `API error: ${response.status} ${response.statusText}`;

      try {
        // Try to parse as JSON, but handle non-JSON responses
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } else {
          // For non-JSON responses, just use the status text
          const text = await response.text();
          console.error("Non-JSON error response:", text);
        }
      } catch (parseError) {
        console.error("Error parsing error response:", parseError);
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("Loudly API response data:", data);

    // Return the complete response data
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error generating music with Loudly:", error);
    return NextResponse.json(
      { error: "Failed to generate music" },
      { status: 500 }
    );
  }
}

// GET: Check status of a song
export async function GET(request: NextRequest) {
  try {
    // Get the song ID from the query parameters
    const url = new URL(request.url);
    console.log(`GET request URL: ${request.url}`);
    console.log(`Query parameters: ${url.searchParams.toString()}`);

    const id = url.searchParams.get("id");
    console.log(`Extracted ID from query: ${id}`);

    if (!id) {
      console.log("No ID found in query parameters");
      return NextResponse.json(
        { error: "Song ID is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.LOUDLY_API_KEY;
    if (!apiKey) {
      console.log("API key not configured");
      return NextResponse.json(
        { error: "API key not configured" },
        { status: 500 }
      );
    }

    console.log(`Checking status for Loudly song ID: ${id}`);
    const loudlyApiUrl = `https://soundtracks-dev.loudly.com/b2b/ai/prompt/songs/${id}`;
    console.log(`Loudly API URL: ${loudlyApiUrl}`);

    const response = await fetch(loudlyApiUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "API-KEY": apiKey,
      },
    });

    console.log(`Loudly API status check response status: ${response.status}`);
    console.log(
      `Loudly API response headers: ${JSON.stringify([
        ...response.headers.entries(),
      ])}`
    );

    if (!response.ok) {
      let errorMessage = `API error: ${response.status} ${response.statusText}`;

      try {
        // Try to parse as JSON, but handle non-JSON responses
        const contentType = response.headers.get("content-type");
        console.log(`Response content type: ${contentType}`);

        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          console.log(`JSON error data: ${JSON.stringify(errorData)}`);
          errorMessage = errorData.message || errorMessage;
        } else {
          // For non-JSON responses, just use the status text
          const text = await response.text();
          console.log(
            `Non-JSON error response (first 200 chars): ${text.substring(
              0,
              200
            )}`
          );
          console.error("Non-JSON error response:", text);
        }
      } catch (parseError) {
        console.error("Error parsing error response:", parseError);
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("Loudly API status check response data:", data);

    // Return the complete song data
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error checking music status with Loudly:", error);
    return NextResponse.json(
      { error: "Failed to check music status" },
      { status: 500 }
    );
  }
}
