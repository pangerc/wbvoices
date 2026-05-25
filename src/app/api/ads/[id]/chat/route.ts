/**
 * Chat Endpoint for Iterative Refinements
 *
 * Allows users to refine an existing ad through conversation.
 * Uses lower reasoning effort since we're making targeted changes.
 *
 * Supports stream-focused iterations:
 * - stream: "voices" | "music" | "sfx" - constrains agent to only modify this stream
 * - parentVersionId: version being iterated from (for lineage tracking)
 *
 * Two request shapes accepted:
 * - JSON: { message, stream?, parentVersionId?, freezeParent? }
 * - multipart/form-data with the same fields + `files` entries; each file is
 *   extracted in-memory via the AAC-27 pipeline and its distilled text is
 *   folded into the message body before the LLM sees it. Raw bytes are
 *   discarded at request end — nothing is stored.
 */

import {
  extractTextFromFile,
  FileTooLargeError,
  MAX_FILES_PER_REQUEST,
  MAX_TOTAL_BYTES,
  UnsupportedFormatError,
  type ExtractionResult,
} from "@/lib/document-extraction";
import { hasConversation } from "@/lib/redis/conversation";
import { setActiveVersion, updateVersionMetadata } from "@/lib/redis/versions";
import { continueConversation } from "@/lib/tool-calling";
import type { ContentStreamType } from "@/types/versions";
import { NextRequest, NextResponse } from "next/server";

// nodejs runtime is load-bearing: pdf-parse / mammoth / xlsx (re-used here
// via document-extraction) are CJS and won't run on Edge.
export const runtime = "nodejs";
// Larger uploads + PDF parsing can push past Vercel's default 10s.
export const maxDuration = 60;

const STREAM_NAMES: Record<ContentStreamType, string> = {
  voices: "VOICE",
  music: "MUSIC",
  sfx: "SOUND EFFECTS",
};

type ChatRequestInputs = {
  message: string;
  stream?: ContentStreamType;
  parentVersionId?: string;
  freezeParent?: boolean;
  extractedRefs: ExtractionResult[];
};

/**
 * Build a focused message that constrains the agent to a single stream
 */
function buildFocusedMessage(
  message: string,
  stream?: ContentStreamType,
  parentVersionId?: string,
): string {
  if (!stream) return message;

  const streamName = STREAM_NAMES[stream];
  const parentContext = parentVersionId
    ? ` You are iterating from version ${parentVersionId}.`
    : "";

  return `[${streamName} ONLY] ${message}

IMPORTANT: Only modify the ${streamName} track. Do NOT touch other streams.${parentContext}
Create a new ${stream === "voices" ? "voice" : stream === "music" ? "music" : "sfx"} draft with the requested changes.`;
}

/**
 * Append a reference-materials section when the user attached files. The
 * extractor already truncates each file to a token-bounded size, so this
 * just labels them and joins.
 */
function withAttachments(message: string, refs: ExtractionResult[]): string {
  if (refs.length === 0) return message;
  const blocks = refs.map((r) => {
    const meta = `${r.filename} — ${r.format.toUpperCase()}, ${(r.sizeBytes / 1024).toFixed(0)} KB${
      r.truncated ? ", truncated" : ""
    }`;
    return `### ${meta}\n${r.text}`;
  });
  return (
    `${message}\n\n## Reference materials (distil — do not quote verbatim)\n` +
    blocks.join("\n\n")
  );
}

async function readInputs(req: NextRequest): Promise<ChatRequestInputs> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const message = String(form.get("message") ?? "");
    const stream = form.get("stream");
    const parentVersionId = form.get("parentVersionId");
    const freezeParent = form.get("freezeParent");
    const files = form.getAll("files").filter((f): f is File => f instanceof File);

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

    // Sequential extraction caps peak memory under several large files.
    const extractedRefs: ExtractionResult[] = [];
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const result = await extractTextFromFile(buffer, file.name, file.type);
      extractedRefs.push(result);
    }

    return {
      message,
      stream: typeof stream === "string" && stream
        ? (stream as ContentStreamType)
        : undefined,
      parentVersionId:
        typeof parentVersionId === "string" && parentVersionId
          ? parentVersionId
          : undefined,
      freezeParent: freezeParent === "true",
      extractedRefs,
    };
  }

  const body = await req.json();
  return {
    message: typeof body.message === "string" ? body.message : "",
    stream: body.stream,
    parentVersionId: body.parentVersionId,
    freezeParent: body.freezeParent,
    extractedRefs: [],
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: adId } = await params;
    const { message, stream, parentVersionId, freezeParent, extractedRefs } =
      await readInputs(req);

    if (!message || message.trim() === "") {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 },
      );
    }

    const conversationExists = await hasConversation(adId);
    if (!conversationExists) {
      return NextResponse.json(
        {
          error:
            "No conversation found for this ad. Generate the ad first using /api/ai/generate",
          adId,
        },
        { status: 400 },
      );
    }

    // Build focused message if stream specified, then fold attachment
    // summaries in. Attachments arrive AFTER focus markers so the stream
    // constraint stays on the leading line where the LLM looks first.
    const focusedMessage = buildFocusedMessage(
      message,
      stream,
      parentVersionId,
    );
    const finalMessage = withAttachments(focusedMessage, extractedRefs);

    console.log(
      `[/api/ads/${adId}/chat] Processing refinement: ${focusedMessage.substring(0, 100)}...`,
    );
    if (extractedRefs.length > 0) {
      console.log(
        `[/api/ads/${adId}/chat] With ${extractedRefs.length} attachment(s): ` +
          extractedRefs.map((r) => `${r.filename}(${r.charsExtracted}c)`).join(", "),
      );
    }
    if (stream) {
      console.log(
        `[/api/ads/${adId}/chat] Stream focus: ${stream}, parent: ${parentVersionId}`,
      );
    }

    // Set parent version as active before creating new draft
    if (freezeParent && parentVersionId && stream) {
      await setActiveVersion(adId, stream, parentVersionId);
      console.log(
        `[/api/ads/${adId}/chat] Set parent ${parentVersionId} as active`,
      );
    }

    const result = await continueConversation(adId, finalMessage);

    console.log(
      `[/api/ads/${adId}/chat] Agent completed with ${result.toolCallHistory.length} tool calls`,
    );
    console.log(`[/api/ads/${adId}/chat] New drafts:`, result.drafts);

    // Update metadata on new versions (if stream was specified)
    if (stream && parentVersionId) {
      const newVersionId = result.drafts[stream];
      if (newVersionId) {
        await updateVersionMetadata(adId, stream, newVersionId, {
          parentVersionId,
          requestText: message, // Original message, not the focused one
        });
        console.log(
          `[/api/ads/${adId}/chat] Updated lineage: ${parentVersionId} → ${newVersionId}`,
        );
      }
    }

    return NextResponse.json({
      conversationId: result.conversationId,
      drafts: result.drafts,
      message: result.message,
      provider: result.provider,
      toolCalls: result.toolCallHistory.length,
      usage: result.totalUsage,
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
    console.error("[/api/ads/[id]/chat] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process chat message",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
