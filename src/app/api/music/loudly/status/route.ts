import { NextRequest, NextResponse } from "next/server";

// GET: Check status of a song
export async function GET(request: NextRequest) {
  try {
    // Get the song ID from the query parameters
    const url = new URL(request.url);
    console.log(`Status GET request URL: ${request.url}`);
    console.log(`Status query parameters: ${url.searchParams.toString()}`);

    const id = url.searchParams.get("id");
    console.log(`Status extracted ID from query: ${id}`);

    if (!id) {
      console.log("Status: No ID found in query parameters");
      return NextResponse.json(
        { error: "Song ID is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.LOUDLY_API_KEY;
    if (!apiKey) {
      console.log("Status: API key not configured");
      return NextResponse.json(
        { error: "API key not configured" },
        { status: 500 }
      );
    }

    console.log(`Status: Checking for Loudly song ID: ${id}`);
    const loudlyApiUrl = `https://soundtracks-dev.loudly.com/b2b/ai/prompt/songs/${id}`;
    console.log(`Status: Loudly API URL: ${loudlyApiUrl}`);

    const response = await fetch(loudlyApiUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "API-KEY": apiKey,
      },
    });

    console.log(`Status: Loudly API check response status: ${response.status}`);

    if (!response.ok) {
      let errorMessage = `API error: ${response.status} ${response.statusText}`;

      try {
        // Try to parse as JSON, but handle non-JSON responses
        const contentType = response.headers.get("content-type");
        console.log(`Status: Response content type: ${contentType}`);

        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          console.log(`Status: JSON error data: ${JSON.stringify(errorData)}`);
          errorMessage = errorData.message || errorMessage;
        } else {
          // For non-JSON responses, just use the status text
          const text = await response.text();
          console.log(
            `Status: Non-JSON error response (first 200 chars): ${text.substring(
              0,
              200
            )}`
          );
          console.error("Status: Non-JSON error response:", text);
        }
      } catch (parseError) {
        console.error("Status: Error parsing error response:", parseError);
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("Status: Loudly API check response data:", data);

    // Return the complete song data
    return NextResponse.json(data);
  } catch (error) {
    console.error("Status: Error checking music status with Loudly:", error);
    return NextResponse.json(
      { error: "Failed to check music status" },
      { status: 500 }
    );
  }
}
