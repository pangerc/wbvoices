import { NextRequest, NextResponse } from "next/server";
import { instructionTemplatesService } from "@/services/instructionTemplatesService";

// Middleware gates /api/admin/* on role=admin.

const ALLOWED_CATEGORIES = new Set(["duration", "audience", "experience", "general"]);
const ALLOWED_PACINGS = new Set(["fast", "normal"]);
const MAX_DURATION_SECONDS = 600;
const MAX_TEXT_FIELD_CHARS = 2000;

function normaliseOptionalText(
  raw: unknown,
  field: string,
  maxChars = MAX_TEXT_FIELD_CHARS
): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") {
    throw new Error(`${field} must be a string or null`);
  }
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.length > maxChars) {
    throw new Error(`${field} exceeds the ${maxChars}-character limit`);
  }
  return trimmed;
}

function normaliseDefaultPacing(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") throw new Error("defaultPacing must be a string or null");
  const v = raw.trim();
  if (v === "") return null;
  if (!ALLOWED_PACINGS.has(v)) {
    throw new Error(`defaultPacing must be one of: ${[...ALLOWED_PACINGS].join(", ")}`);
  }
  return v;
}

function normaliseDefaultDuration(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0 || n > MAX_DURATION_SECONDS) {
    throw new Error(
      `defaultDurationSeconds must be a positive integer ≤ ${MAX_DURATION_SECONDS}`
    );
  }
  return n;
}

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
    const {
      title,
      description,
      category,
      systemInstructions,
      exampleOutput,
      defaultPacing,
      defaultCta,
      defaultDurationSeconds,
      defaultMusicStyle,
      bestPractice,
      isActive,
      sortOrder,
    } = body;

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
      exampleOutput: normaliseOptionalText(exampleOutput, "exampleOutput", 4000) ?? null,
      defaultPacing: normaliseDefaultPacing(defaultPacing) ?? null,
      defaultCta: normaliseOptionalText(defaultCta, "defaultCta", 200) ?? null,
      defaultDurationSeconds: normaliseDefaultDuration(defaultDurationSeconds) ?? null,
      defaultMusicStyle:
        normaliseOptionalText(defaultMusicStyle, "defaultMusicStyle", 600) ?? null,
      bestPractice: normaliseOptionalText(bestPractice, "bestPractice", 1000) ?? null,
      isActive: isActive ?? true,
      sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error("Error creating instruction template:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create template" },
      { status: error instanceof Error && error.message.match(/^(category|default|exampleOutput|bestPractice)/) ? 400 : 500 }
    );
  }
}
