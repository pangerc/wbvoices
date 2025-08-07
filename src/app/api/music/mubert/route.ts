export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { uploadMusicToBlob } from "@/utils/blob-storage";

const MUBERT_BASE_URL = "https://music-api.mubert.com/api/v3";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt, duration = 30, projectId, _internal_ready_url, _internal_track_id } = body;

  // Handle internal request to process ready track
  if (_internal_ready_url && _internal_track_id) {
    console.log("Processing ready Mubert track for blob upload...");
    
    try {
      const blobResult = await uploadMusicToBlob(
        _internal_ready_url,
        prompt.substring(0, 50),
        'mubert',
        projectId
      );
      
      return NextResponse.json({
        id: _internal_track_id,
        title: prompt.substring(0, 50),
        url: blobResult.url,
        duration: duration,
        provider: "mubert",
        original_url: _internal_ready_url,
        blob_info: {
          downloadUrl: blobResult.downloadUrl
        }
      });
    } catch (error) {
      console.error('Failed to upload ready Mubert track to blob:', error);
      // Fallback: return original URL
      return NextResponse.json({
        id: _internal_track_id,
        title: prompt.substring(0, 50),
        url: _internal_ready_url,
        duration: duration,
        provider: "mubert",
      });
    }
  }

  if (!prompt) {
    return NextResponse.json(
      { error: "Missing required parameter: prompt" },
      { status: 400 }
    );
  }

  const companyId = process.env.MUBERT_COMPANY_ID;
  const licenseToken = process.env.MUBERT_LICENSE_TOKEN;

  if (!companyId || !licenseToken) {
    return NextResponse.json(
      { error: "Mubert API credentials are missing" },
      { status: 500 }
    );
  }

  console.log(`Generating music with Mubert: "${prompt}" (${duration}s)`);
  console.log("Debug - Company ID exists:", !!companyId);
  console.log("Debug - License Token exists:", !!licenseToken);
  console.log("Debug - Company ID first 8 chars:", companyId?.substring(0, 8));
  console.log("Debug - License Token first 8 chars:", licenseToken?.substring(0, 8));

  try {
    // Step 1: Register a customer/user to get customer-id and access-token
    console.log("Step 1: Registering customer with Mubert...");
    const customId = `wb-voices-${projectId || Date.now()}`;
    
    const customerResponse = await fetch(`${MUBERT_BASE_URL}/service/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "company-id": companyId,
        "license-token": licenseToken,
      },
      body: JSON.stringify({
        custom_id: customId,
      }),
    });

    if (!customerResponse.ok) {
      const errorText = await customerResponse.text();
      console.error("Mubert customer registration error:", errorText);
      return NextResponse.json(
        { error: `Mubert customer registration error: ${customerResponse.status} ${errorText}` },
        { status: customerResponse.status }
      );
    }

    const customerData = await customerResponse.json();
    console.log("✅ Customer registration SUCCESS!");
    console.log("Response keys:", Object.keys(customerData));
    console.log("Full response:", JSON.stringify(customerData, null, 2));
    
    const customerId = customerData.data?.id;
    const accessToken = customerData.data?.access?.token;

    console.log("Parsed customerId:", customerId);
    console.log("Parsed accessToken:", accessToken);

    if (!customerId || !accessToken) {
      console.error("❌ Could not extract credentials!");
      console.error("Available fields:", Object.keys(customerData));
      return NextResponse.json(
        { error: "Failed to get customer credentials from registration response" },
        { status: 500 }
      );
    }

    console.log("Got customer credentials:", customerId.substring(0, 8), accessToken.substring(0, 8));

    // Step 2: Generate music track with customer credentials
    console.log("Step 2: Generating music track...");
    const response = await fetch(`${MUBERT_BASE_URL}/public/tracks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "customer-id": customerId,
        "access-token": accessToken,
      },
      body: JSON.stringify({
        prompt: prompt,
        duration: duration,
        bitrate: 128,
        mode: "track",
        intensity: "medium",
        format: "mp3",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Mubert API error:", errorText);
      return NextResponse.json(
        { error: `Mubert API error: ${response.status} ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("Mubert API response:", data);

    const trackData = data.data;
    if (!trackData) {
      return NextResponse.json(
        { error: "No track data returned from Mubert API" },
        { status: 500 }
      );
    }

    const generation = trackData.generations?.[0];
    if (!generation) {
      return NextResponse.json(
        { error: "No generation data returned from Mubert API" },
        { status: 500 }
      );
    }

    // If track is already ready, return immediately
    if (generation.status === 'done' && generation.url) {
      console.log("🎵 Track was already ready!");
      
      const blobResult = await uploadMusicToBlob(
        generation.url,
        prompt.substring(0, 50),
        'mubert',
        projectId
      );
      
      return NextResponse.json({
        id: trackData.id,
        title: prompt.substring(0, 50),
        url: blobResult.url,
        duration: trackData.duration,
        provider: "mubert",
        original_url: generation.url,
        blob_info: {
          downloadUrl: blobResult.downloadUrl
        }
      });
    }

    // If still processing, return status for client-side polling (like Loudly)
    if (generation.status === 'processing') {
      console.log("Track is processing, returning task info for client polling...");
      
      return NextResponse.json({
        id: trackData.id,
        status: 'processing',
        customer_id: customerId,
        access_token: accessToken,
        provider: "mubert",
        message: "Track is being generated, will be ready shortly"
      });
    }

    // If we get here, the status is unexpected
    console.warn(`Unexpected generation status: ${generation.status}`);
    return NextResponse.json(
      { error: `Unexpected track status: ${generation.status}` },
      { status: 500 }
    );
  } catch (error) {
    console.error("Error generating music with Mubert:", error);
    return NextResponse.json(
      { 
        error: error instanceof Error 
          ? `Mubert music generation failed: ${error.message}` 
          : "Unknown error generating music with Mubert" 
      },
      { status: 500 }
    );
  }
}