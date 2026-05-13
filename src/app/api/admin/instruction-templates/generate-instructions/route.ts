import {
  extractTextFromFile,
  FileTooLargeError,
  MAX_FILES_PER_REQUEST,
  MAX_TOTAL_BYTES,
  UnsupportedFormatError,
  type ExtractionResult,
} from "@/lib/document-extraction";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// nodejs runtime is load-bearing: mammoth/pdf-parse/xlsx are CJS and won't
// run on Edge.
export const runtime = "nodejs";
// PDF parsing of larger docs blows past the 10s default.
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a creative-strategy assistant for an audio ad platform.
Given a short template name, description, optional category, and optional reference materials, write ONE concise creative-direction block (3–6 sentences, max ~120 words) that will be appended to the system prompt of a script-writing LLM.
Cover, where relevant: target runtime / word count, narrative structure, music mood, SFX density, voice count, and CTA placement.
Plain prose only — no headings, no lists, no quotes. Speak in directives ("Open with...", "Keep music...", "Limit to..."), not descriptions of the template.
When reference materials are provided, distil the load-bearing creative direction from them — brand voice cues, tonal markers, structural patterns. Do not quote them verbatim and do not include facts that aren't load-bearing for the creative.`;

interface PromptInputs {
  title: string;
  description: string;
  category?: string;
  extractedRefs: ExtractionResult[];
}

export async function POST(req: NextRequest) {
  try {
    const inputs = await readInputs(req);

    if (!inputs.title.trim() || !inputs.description.trim()) {
      return NextResponse.json(
        { error: "title and description are required" },
        { status: 400 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 },
      );
    }

    const userMessage = buildUserMessage(inputs);

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: "gpt-5.4",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      max_output_tokens: inputs.extractedRefs.length > 0 ? 900 : 600,
    });

    const instructions = response.output_text?.trim();
    if (!instructions) {
      return NextResponse.json(
        { error: "No instructions generated" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      instructions,
      processedFiles: inputs.extractedRefs.map((r) => ({
        filename: r.filename,
        format: r.format,
        sizeBytes: r.sizeBytes,
        charsExtracted: r.charsExtracted,
        truncated: r.truncated,
      })),
    });
  } catch (error) {
    if (
      error instanceof UnsupportedFormatError ||
      error instanceof FileTooLargeError
    ) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 },
      );
    }
    console.error("Error generating template instructions:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate instructions",
      },
      { status: 500 },
    );
  }
}

async function readInputs(req: NextRequest): Promise<PromptInputs> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const title = String(form.get("title") ?? "");
    const description = String(form.get("description") ?? "");
    const category = form.get("category");
    const files = form
      .getAll("files")
      .filter((f): f is File => f instanceof File);

    if (files.length > MAX_FILES_PER_REQUEST) {
      throw new Error(
        `Too many files (${files.length}); max is ${MAX_FILES_PER_REQUEST} per request.`,
      );
    }
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error(
        `Combined upload size ${(totalBytes / 1024 / 1024).toFixed(1)} MB exceeds the ` +
          `${MAX_TOTAL_BYTES / 1024 / 1024} MB total limit.`,
      );
    }

    const extractedRefs: ExtractionResult[] = [];
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      // Sequential extraction caps peak memory when several large files
      // come in together.
      const result = await extractTextFromFile(buffer, file.name, file.type);
      extractedRefs.push(result);
    }

    return {
      title,
      description,
      category: typeof category === "string" ? category : undefined,
      extractedRefs,
    };
  }

  const body = await req.json();
  return {
    title: typeof body.title === "string" ? body.title : "",
    description: typeof body.description === "string" ? body.description : "",
    category: typeof body.category === "string" ? body.category : undefined,
    extractedRefs: [],
  };
}

function buildUserMessage(inputs: PromptInputs): string {
  const { title, description, category, extractedRefs } = inputs;
  const categoryLine =
    category && category.trim() ? `\nCategory: ${category.trim()}` : "";

  let referenceSection = "";
  if (extractedRefs.length > 0) {
    const blocks = extractedRefs.map((r) => {
      const meta = `${r.filename} — ${r.format.toUpperCase()}, ${(r.sizeBytes / 1024).toFixed(0)} KB${
        r.truncated ? ", truncated" : ""
      }`;
      return `### ${meta}\n${r.text}`;
    });
    referenceSection =
      `\n\n## Reference materials (do not quote verbatim, distil only)\n` +
      blocks.join("\n\n");
  }

  return (
    `Template title: ${title.trim()}\n` +
    `Description: ${description.trim()}` +
    `${categoryLine}` +
    `${referenceSection}` +
    `\n\nWrite the creative-direction block.`
  );
}
