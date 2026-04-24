import { NextRequest, NextResponse } from "next/server";
import { suggestedTonesService } from "@/services/suggestedTonesService";

/**
 * Admin CRUD for suggested tones of voice (AAC-25).
 * GET   — list all tones (admin sees active + inactive)
 * POST  — create a new tone
 * Middleware gates /api/admin/* on role=admin.
 */

export async function GET() {
  try {
    const tones = await suggestedTonesService.list();
    return NextResponse.json({ tones });
  } catch (error) {
    console.error("Error listing tones:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list tones" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, voiceInstructions, isActive } = body;

    if (!title?.trim() || !description?.trim() || !voiceInstructions?.trim()) {
      return NextResponse.json(
        { error: "title, description and voiceInstructions are required" },
        { status: 400 }
      );
    }

    const tone = await suggestedTonesService.create({
      title: title.trim(),
      description: description.trim(),
      voiceInstructions: voiceInstructions.trim(),
      isActive: isActive ?? true,
    });

    return NextResponse.json({ tone }, { status: 201 });
  } catch (error) {
    console.error("Error creating tone:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create tone" },
      { status: 500 }
    );
  }
}
