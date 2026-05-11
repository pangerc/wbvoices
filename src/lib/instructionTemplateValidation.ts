// Shared validators for the admin instruction-template routes. POST and
// PATCH share the same allowlists + normalisers; keeping them here means
// the category/pacing/duration contracts can't drift between create and
// update.

export const ALLOWED_CATEGORIES = new Set([
  "duration",
  "audience",
  "experience",
  "general",
]);
export const ALLOWED_PACINGS = new Set(["fast", "normal"]);
export const MAX_DURATION_SECONDS = 600;
export const MAX_TEXT_FIELD_CHARS = 2000;

// Returned discriminant marks the difference between "field is absent — keep
// existing value" (undefined) and "field is explicitly null — clear it"
// (null). Callers spread the result conditionally to avoid setting columns
// to undefined.
export function normaliseOptionalText(
  raw: unknown,
  field: string,
  maxChars: number = MAX_TEXT_FIELD_CHARS,
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

export function normaliseDefaultPacing(
  raw: unknown,
): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") {
    throw new Error("defaultPacing must be a string or null");
  }
  const v = raw.trim();
  if (v === "") return null;
  if (!ALLOWED_PACINGS.has(v)) {
    throw new Error(
      `defaultPacing must be one of: ${[...ALLOWED_PACINGS].join(", ")}`,
    );
  }
  return v;
}

export function normaliseDefaultDuration(
  raw: unknown,
): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (
    !Number.isFinite(n) ||
    !Number.isInteger(n) ||
    n <= 0 ||
    n > MAX_DURATION_SECONDS
  ) {
    throw new Error(
      `defaultDurationSeconds must be a positive integer ≤ ${MAX_DURATION_SECONDS}`,
    );
  }
  return n;
}

// Validation errors get a 400 status; everything else is treated as a 500.
const VALIDATION_FIELD_PREFIXES =
  /^(category|default|exampleOutput|bestPractice)/;
export function isValidationError(err: unknown): boolean {
  return err instanceof Error && VALIDATION_FIELD_PREFIXES.test(err.message);
}
