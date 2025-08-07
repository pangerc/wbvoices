export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";

const MUBERT_BASE_URL = "https://music-api.mubert.com/api/v3";

export async function GET(req: NextRequest) {
  const trackId = req.nextUrl.searchParams.get("id");
  const customerId = req.nextUrl.searchParams.get("customer_id");
  const accessToken = req.nextUrl.searchParams.get("access_token");

  if (!trackId || !customerId || !accessToken) {
    return NextResponse.json(
      { error: "Missing required parameters: id, customer_id, access_token" },
      { status: 400 }
    );
  }

  console.log(`Checking Mubert track status: ${trackId}`);

  try {
    const response = await fetch(`${MUBERT_BASE_URL}/public/tracks/${trackId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "customer-id": customerId,
        "access-token": accessToken,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Mubert status check error:", errorText);
      return NextResponse.json(
        { error: `Mubert status error: ${response.status} ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("Mubert status response:", data);

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error checking Mubert track status:", error);
    return NextResponse.json(
      { 
        error: error instanceof Error 
          ? `Status check failed: ${error.message}` 
          : "Unknown error checking track status" 
      },
      { status: 500 }
    );
  }
}