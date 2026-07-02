import { afterEach, describe, expect, it } from "vitest";
import { SsrfError, validateSourceUrl } from "../ssrf";

const publicResolver = async () => ["93.184.216.34"]; // example.com
const privateResolver = async () => ["10.0.0.5"];

afterEach(() => {
  delete process.env.BACKUP_PULL_ALLOWED_HOSTS;
});

describe("validateSourceUrl", () => {
  it("accepts an https host resolving to a public IP", async () => {
    await expect(
      validateSourceUrl("https://example.com/x", publicResolver),
    ).resolves.toContain("https://example.com");
  });

  it("rejects non-https", async () => {
    await expect(validateSourceUrl("http://example.com", publicResolver)).rejects.toBeInstanceOf(SsrfError);
  });

  it("rejects localhost", async () => {
    await expect(validateSourceUrl("https://localhost", publicResolver)).rejects.toThrow(/blocked host/i);
  });

  it("rejects a literal private IP", async () => {
    await expect(validateSourceUrl("https://10.1.2.3")).rejects.toThrow(/private/i);
    await expect(validateSourceUrl("https://127.0.0.1")).rejects.toThrow(/private/i);
    await expect(validateSourceUrl("https://169.254.169.254")).rejects.toThrow(/private/i);
  });

  it("rejects a public hostname that resolves to a private IP (DNS rebinding)", async () => {
    await expect(
      validateSourceUrl("https://evil.example.com", privateResolver),
    ).rejects.toThrow(/private/i);
  });

  it("rejects .local and IPv6 loopback", async () => {
    await expect(validateSourceUrl("https://printer.local", publicResolver)).rejects.toThrow(/blocked/i);
    await expect(validateSourceUrl("https://[::1]")).rejects.toThrow(/private/i);
  });

  it("allowlist bypasses scheme + private checks", async () => {
    process.env.BACKUP_PULL_ALLOWED_HOSTS = "localhost,10.0.0.5";
    await expect(validateSourceUrl("http://localhost:3000/x")).resolves.toContain("localhost");
  });
});
