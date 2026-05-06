import { NextRequest, NextResponse } from "next/server";
import { instructionTemplatesService } from "@/services/instructionTemplatesService";

const ALLOWED_CATEGORIES = new Set(["duration", "audience", "experience", "general"]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const template = await instructionTemplatesService.getById(id);
    if (!template) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ template });
  } catch (error) {
    console.error("Error fetching instruction template:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch template" },
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
      category?: string;
      systemInstructions?: string;
      exampleOutput?: string | null;
      isActive?: boolean;
      sortOrder?: number;
    } = {};

    if (typeof body.title === "string") patch.title = body.title.trim();
    if (typeof body.description === "string") patch.description = body.description.trim();
    if (typeof body.category === "string") {
      const c = body.category.trim();
      if (!ALLOWED_CATEGORIES.has(c)) {
        return NextResponse.json(
          { error: `category must be one of: ${[...ALLOWED_CATEGORIES].join(", ")}` },
          { status: 400 }
        );
      }
      patch.category = c;
    }
    if (typeof body.systemInstructions === "string")
      patch.systemInstructions = body.systemInstructions.trim();
    if (typeof body.exampleOutput === "string") {
      const trimmed = body.exampleOutput.trim();
      patch.exampleOutput = trimmed === "" ? null : trimmed;
    } else if (body.exampleOutput === null) {
      patch.exampleOutput = null;
    }
    if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
    if (typeof body.sortOrder === "number") patch.sortOrder = body.sortOrder;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "No updatable fields supplied" },
        { status: 400 }
      );
    }

    const template = await instructionTemplatesService.update(id, patch);
    if (!template) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ template });
  } catch (error) {
    console.error("Error updating instruction template:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update template" },
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
    const ok = await instructionTemplatesService.delete(id);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting instruction template:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete template" },
      { status: 500 }
    );
  }
}
