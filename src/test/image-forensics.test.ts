import { describe, expect, it } from "vitest";

import { detectImageFormat, extractImageStructure, formatBytes, metadataFreeFilename } from "@/lib/image-forensics";

describe("image file inspection helpers", () => {
  it("recognizes JPEG and PNG signatures", () => {
    expect(detectImageFormat(new Uint8Array([0xff, 0xd8, 0xff]))).toBe("JPEG");
    expect(detectImageFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("PNG");
  });

  it("reports the supported chunks and metadata-bearing JPEG segments", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x06, 1, 2, 3, 4, 0xff, 0xd9]);
    expect(extractImageStructure(bytes, "JPEG")).toEqual([
      { name: "APP1 · EXIF / XMP", size: 4 },
      { name: "SOI · Start of image", size: 2 },
      { name: "EOI · End of image", size: 2 },
    ]);
  });

  it("formats image sizes with readable units", () => {
    expect(formatBytes(120)).toBe("120 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("creates a clear-copy filename with the matching output extension", () => {
    expect(metadataFreeFilename("Diamond ring.jpg", "image/jpeg")).toBe("Diamond-ring-clean.jpg");
    expect(metadataFreeFilename("icon.svg", "image/png")).toBe("icon-clean.png");
  });
});