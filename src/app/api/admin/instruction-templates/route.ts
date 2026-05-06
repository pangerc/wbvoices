import { NextRequest, NextResponse } from "next/server";
import { instructionTemplatesService } from "@/services/instructionTemplatesService";

/**
 * Admin CRUD for instruction templates (AAC-27).
 * GET   — list all templates (admin sees active + inactive)
 * POST  — create a new template
 * Middleware gates /api/admin/* on role=admin.
 */

const ALLOWED_CATEGORIES = new Set(["duration", "audience", "experience", "general"]);

export async function GET() {
  try {
    const templates = await instructionTemplatesService.list();
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Error listing instruction templates:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list templates" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, category, systemInstructions, exampleOutput, isActive, sortOrder } = body;

    if (!title?.trim() || !description?.trim() || !systemInstructions?.trim()) {
      return NextResponse.json(
        { error: "title, description and systemInstructions are required" },
        { status: 400 }
      );
    }

    const normalisedCategory =
      typeof category === "string" && category.trim()
        ? category.trim()
        : "general";
    if (!ALLOWED_CATEGORIES.has(normalisedCategory)) {
      return NextResponse.json(
        { error: `category must be one of: ${[...ALLOWED_CATEGORIES].join(", ")}` },
        { status: 400 }
      );
    }

    const template = await instructionTemplatesService.create({
      title: title.trim(),
      description: description.trim(),
      category: normalisedCategory,
      systemInstructions: systemInstructions.trim(),
      exampleOutput:
        typeof exampleOutput === "string" && exampleOutput.trim()
          ? exampleOutput.trim()
          : null,
      isActive: isActive ?? true,
      sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error("Error creating instruction template:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create template" },
      { status: 500 }
    );
  }
}
