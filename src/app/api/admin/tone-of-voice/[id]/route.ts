import { NextRequest, NextResponse } from "next/server";
import { suggestedTonesService } from "@/services/suggestedTonesService";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tone = await suggestedTonesService.getById(id);
    if (!tone) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ tone });
  } catch (error) {
    console.error("Error fetching tone:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch tone" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const patch: {
      title?: string;
      description?: string;
      voiceInstructions?: string;
      isActive?: boolean;
    } = {};

    if (typeof body.title === "string") patch.title = body.title.trim();
    if (typeof body.description === "string") patch.description = body.description.trim();
    if (typeof body.voiceInstructions === "string") patch.voiceInstructions = body.voiceInstructions.trim();
    if (typeof body.isActive === "boolean") patch.isActive = body.isActive;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "No updatable fields supplied" },
        { status: 400 }
      );
    }

    const tone = await suggestedTonesService.update(id, patch);
    if (!tone) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ tone });
  } catch (error) {
    console.error("Error updating tone:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update tone" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ok = await suggestedTonesService.delete(id);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting tone:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete tone" },
      { status: 500 }
    );
  }
}
