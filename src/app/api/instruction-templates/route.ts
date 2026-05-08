import { NextResponse } from "next/server";
import { instructionTemplatesService } from "@/services/instructionTemplatesService";

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
