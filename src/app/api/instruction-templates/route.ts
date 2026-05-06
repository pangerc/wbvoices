import { NextResponse } from "next/server";
import { instructionTemplatesService } from "@/services/instructionTemplatesService";

/**
 * Public read-only list of active instruction templates (AAC-27),
 * consumed by the brief panel CreativeTemplateGallery. Admin-only CRUD
 * lives under /api/admin/instruction-templates.
 */
export async function GET() {
  try {
    const templates = await instructionTemplatesService.list({ activeOnly: true });
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Error listing public instruction templates:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list templates" },
      { status: 500 }
    );
  }
}
