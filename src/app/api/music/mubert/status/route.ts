export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { createProvider } from "@/lib/providers";

export async function GET(req: NextRequest) {
  const provider = createProvider('music', 'mubert');
  
  // Extract parameters from URL
  const trackId = req.nextUrl.searchParams.get("id");
  const customerId = req.nextUrl.searchParams.get("customer_id");
  const accessToken = req.nextUrl.searchParams.get("access_token");

  if (!trackId || !customerId || !accessToken) {
    return NextResponse.json(
      { error: "Missing required parameters: id, customer_id, access_token" },
      { status: 400 }
    );
  }

  if (!provider.pollStatus) {
    return NextResponse.json(
      { error: "Provider does not support polling" },
      { status: 400 }
    );
  }

  try {
    const result = await provider.pollStatus(trackId, { customerId, accessToken });
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    // Return status data in the format the client expects
    // The client expects: { data: { generations: [{ status: 'done', url: '...' }] } }
    if (result.data?.status === 'completed' && result.data?.generation_url) {
      return NextResponse.json({
        data: {
          id: trackId,
          generations: [{
            status: 'done',
            url: result.data.generation_url
          }]
        }
      });
    }

    // Return processing status in expected format
    return NextResponse.json({
      data: {
        id: trackId,
        generations: [{
          status: result.data?.status || 'processing',
          url: null
        }]
      }
    });
  } catch (error) {
    console.error("Error checking Mubert status:", error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "Unknown error checking track status" 
      },
      { status: 500 }
    );
  }
}