import { describe, expect, it, vi } from "vitest";
import { normalizeCaPem } from "@/server/db";

vi.mock("server-only", () => ({}));

describe("normalizeCaPem", () => {
  it("converts single-line escaped newlines into multiline PEM certificates", () => {
    const escaped = "  -----BEGIN CERTIFICATE-----\\nABC123\\n-----END CERTIFICATE-----  ";
    expect(normalizeCaPem(escaped)).toBe("-----BEGIN CERTIFICATE-----\nABC123\n-----END CERTIFICATE-----");
  });

  it("preserves existing multiline PEM certificates", () => {
    const pem = "-----BEGIN CERTIFICATE-----\nABC123\n-----END CERTIFICATE-----";
    expect(normalizeCaPem(pem)).toBe(pem);
  });
});
