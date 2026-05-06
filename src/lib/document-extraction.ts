/**
 * In-memory document text extraction for instruction-template references.
 *
 * Accepts uploaded files (PDF, DOCX, MD, TXT, CSV, XLSX/XLS) and returns
 * plain-text content suitable for folding into an LLM prompt. Nothing is
 * persisted — buffers and extracted text live only for the duration of the
 * request that called the extractor.
 *
 * The extracted text is hard-capped per file to keep the LLM call bounded;
 * truncation happens at character boundaries and appends an ellipsis marker.
 */

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB per file
export const MAX_TOTAL_BYTES = 60 * 1024 * 1024; // 60 MB across all files
export const MAX_EXTRACTED_CHARS = 24_000;       // ~6k tokens per file
export const MAX_FILES_PER_REQUEST = 10;

export type SupportedFormat =
  | "pdf"
  | "docx"
  | "markdown"
  | "text"
  | "csv"
  | "xlsx";

const EXTENSION_MAP: Record<string, SupportedFormat> = {
  pdf: "pdf",
  docx: "docx",
  md: "markdown",
  markdown: "markdown",
  txt: "text",
  text: "text",
  csv: "csv",
  xlsx: "xlsx",
  xls: "xlsx", // SheetJS handles both with the same read() entry point
  xlsm: "xlsx",
};

const MIME_MAP: Record<string, SupportedFormat> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "text/plain": "text",
  "text/csv": "csv",
  "application/csv": "csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xlsx",
};

/**
 * Resolve a file's format from its (browser-supplied) MIME and filename.
 * Filename extension wins over MIME because browsers sometimes report
 * `application/octet-stream` for less common types (e.g. `.md`).
 */
export function detectFormat(name: string, mime?: string): SupportedFormat | null {
  const lowerName = name.toLowerCase();
  const ext = lowerName.includes(".") ? lowerName.split(".").pop() ?? "" : "";
  if (ext && EXTENSION_MAP[ext]) return EXTENSION_MAP[ext];
  if (mime && MIME_MAP[mime.toLowerCase()]) return MIME_MAP[mime.toLowerCase()];
  return null;
}

export class UnsupportedFormatError extends Error {
  readonly code = "UNSUPPORTED_FORMAT";
  constructor(public readonly filename: string, public readonly mime?: string) {
    super(
      `Unsupported file format for "${filename}"${mime ? ` (mime=${mime})` : ""}. ` +
        `Allowed: PDF, DOCX, Markdown (.md), plain text (.txt), CSV, Excel (.xlsx/.xls).`
    );
  }
}

export class FileTooLargeError extends Error {
  readonly code = "FILE_TOO_LARGE";
  constructor(public readonly filename: string, public readonly bytes: number) {
    super(
      `File "${filename}" is ${(bytes / 1024 / 1024).toFixed(1)} MB — ` +
        `exceeds the per-file limit of ${MAX_FILE_BYTES / 1024 / 1024} MB.`
    );
  }
}

export interface ExtractionResult {
  filename: string;
  format: SupportedFormat;
  sizeBytes: number;
  charsExtracted: number;
  truncated: boolean;
  text: string;
}

/**
 * Extract text from a single file buffer.
 *
 * Returns an `ExtractionResult` with the (possibly truncated) text. Throws
 * `UnsupportedFormatError` when the format can't be detected, `FileTooLargeError`
 * when the buffer exceeds `MAX_FILE_BYTES`, or a generic `Error` when a
 * format-specific parser fails.
 */
export async function extractTextFromFile(
  buffer: ArrayBuffer,
  filename: string,
  mime?: string
): Promise<ExtractionResult> {
  const sizeBytes = buffer.byteLength;
  if (sizeBytes > MAX_FILE_BYTES) {
    throw new FileTooLargeError(filename, sizeBytes);
  }

  const format = detectFormat(filename, mime);
  if (!format) throw new UnsupportedFormatError(filename, mime);

  const rawText = await extractByFormat(format, buffer, filename);
  const cleaned = collapseWhitespace(rawText);
  const truncated = cleaned.length > MAX_EXTRACTED_CHARS;
  const text = truncated
    ? cleaned.slice(0, MAX_EXTRACTED_CHARS) + "\n\n…[truncated]"
    : cleaned;

  return {
    filename,
    format,
    sizeBytes,
    charsExtracted: cleaned.length,
    truncated,
    text,
  };
}

async function extractByFormat(
  format: SupportedFormat,
  buffer: ArrayBuffer,
  filename: string
): Promise<string> {
  switch (format) {
    case "pdf": {
      // pdf-parse v2 exports a class. Dynamic import keeps the heavy worker
      // bundle out of the route's cold start when no PDF is uploaded.
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        return typeof result.text === "string" ? result.text : "";
      } finally {
        await parser.destroy().catch(() => {});
      }
    }
    case "docx": {
      const mammoth = await import("mammoth");
      const nodeBuffer = Buffer.from(buffer);
      const result = await mammoth.extractRawText({ buffer: nodeBuffer });
      return result.value;
    }
    case "markdown":
    case "text":
    case "csv": {
      // All three are text-shaped formats. We deliberately don't render
      // CSV into a tabular preview — feeding raw rows preserves header
      // semantics and the LLM handles it well enough for distillation.
      return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    }
    case "xlsx": {
      const xlsx = await import("xlsx");
      const wb = xlsx.read(new Uint8Array(buffer), { type: "array" });
      // Render each sheet as CSV-ish rows under a sheet-name header. Joining
      // with double-newline keeps sheet boundaries legible to the LLM.
      const sheets = wb.SheetNames.map((sheetName) => {
        const sheet = wb.Sheets[sheetName];
        const csv = xlsx.utils.sheet_to_csv(sheet, { blankrows: false });
        return `# Sheet: ${sheetName}\n${csv}`;
      });
      return sheets.join("\n\n");
    }
    default: {
      // Exhaustive guard — TS narrows `format` to `never` here. If a new
      // SupportedFormat is added without a switch arm, this fails loudly.
      const _exhaustive: never = format;
      throw new Error(`No extractor wired for format ${String(_exhaustive)} (file: ${filename})`);
    }
  }
}

/**
 * Collapse runs of whitespace to keep token counts tight without losing
 * paragraph structure. Multiple newlines collapse to two; multiple spaces
 * collapse to one; trailing/leading whitespace trimmed.
 */
function collapseWhitespace(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}
