// Buffers and extracted text are intentionally request-scoped; never write
// them to disk or DB — that's the whole reason this lives outside the
// blob-upload path.

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 60 * 1024 * 1024;
// ~6k tokens per file — load-bearing for the LLM call budget.
export const MAX_EXTRACTED_CHARS = 24_000;
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
  xls: "xlsx",
  xlsm: "xlsx",
};

const MIME_MAP: Record<string, SupportedFormat> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "text/plain": "text",
  "text/csv": "csv",
  "application/csv": "csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xlsx",
};

// Extension wins over MIME — browsers report `application/octet-stream`
// for some types (notably .md) so MIME alone misses them.
export function detectFormat(
  name: string,
  mime?: string,
): SupportedFormat | null {
  const lowerName = name.toLowerCase();
  const ext = lowerName.includes(".") ? (lowerName.split(".").pop() ?? "") : "";
  if (ext && EXTENSION_MAP[ext]) return EXTENSION_MAP[ext];
  if (mime && MIME_MAP[mime.toLowerCase()]) return MIME_MAP[mime.toLowerCase()];
  return null;
}

export class UnsupportedFormatError extends Error {
  readonly code = "UNSUPPORTED_FORMAT";
  constructor(
    public readonly filename: string,
    public readonly mime?: string,
  ) {
    super(
      `Unsupported file format for "${filename}"${mime ? ` (mime=${mime})` : ""}. ` +
        `Allowed: PDF, DOCX, Markdown (.md), plain text (.txt), CSV, Excel (.xlsx/.xls).`,
    );
  }
}

export class FileTooLargeError extends Error {
  readonly code = "FILE_TOO_LARGE";
  constructor(
    public readonly filename: string,
    public readonly bytes: number,
  ) {
    super(
      `File "${filename}" is ${(bytes / 1024 / 1024).toFixed(1)} MB — ` +
        `exceeds the per-file limit of ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
    );
  }
}

export type ExtractionResult = {
  filename: string;
  format: SupportedFormat;
  sizeBytes: number;
  charsExtracted: number;
  truncated: boolean;
  text: string;
};

export async function extractTextFromFile(
  buffer: ArrayBuffer,
  filename: string,
  mime?: string,
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
  filename: string,
): Promise<string> {
  switch (format) {
    case "pdf": {
      // Dynamic import keeps the pdfjs worker bundle out of cold start when
      // no PDF is uploaded.
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
      // CSV stays as raw rows on purpose — header semantics are clearer to
      // the LLM than a rendered table.
      return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    }
    case "xlsx": {
      const xlsx = await import("xlsx");
      const wb = xlsx.read(new Uint8Array(buffer), { type: "array" });
      const sheets = wb.SheetNames.map((sheetName) => {
        const sheet = wb.Sheets[sheetName];
        const csv = xlsx.utils.sheet_to_csv(sheet, { blankrows: false });
        return `# Sheet: ${sheetName}\n${csv}`;
      });
      return sheets.join("\n\n");
    }
    default: {
      const _exhaustive: never = format;
      throw new Error(
        `No extractor wired for format ${String(_exhaustive)} (file: ${filename})`,
      );
    }
  }
}

function collapseWhitespace(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}
