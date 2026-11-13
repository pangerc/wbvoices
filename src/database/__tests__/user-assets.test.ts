import { escapeLikePattern } from "@/database/user-assets";
import { describe, expect, it } from "vitest";

/**
 * The library search matches filenames with `ILIKE '%…%'`, so the user's text
 * must not be able to inject wildcards of its own.
 */
describe("escapeLikePattern", () => {
  it("leaves plain text alone", () => {
    expect(escapeLikePattern("Brand sting")).toBe("Brand sting");
  });

  it("escapes % and _ so they match literally", () => {
    expect(escapeLikePattern("100%_loud")).toBe("100\\%\\_loud");
  });

  it("escapes the escape character itself", () => {
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });
});
