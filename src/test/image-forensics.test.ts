import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeImage,
  detectImageFormat,
  extractImageStructure,
  formatBytes,
  metadataFreeFilename,
  summarizeRgbaPixels,
} from "@/lib/image-forensics";

describe("image file inspection helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("recognizes JPEG, PNG, and WebP signatures", () => {
    expect(detectImageFormat(new Uint8Array([0xff, 0xd8, 0xff]))).toBe("JPEG");
    expect(detectImageFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("PNG");
    expect(
      detectImageFormat(
        new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
      ),
    ).toBe("WebP");
  });

  it("reports JPEG structure in order and omits EOI on truncated files", () => {
    const complete = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x06, 1, 2, 3, 4, 0xff, 0xd9]);
    expect(extractImageStructure(complete, "JPEG")).toEqual([
      { name: "SOI · Start of image", size: 2 },
      { name: "APP1 · EXIF / XMP", size: 4 },
      { name: "EOI · End of image", size: 2 },
    ]);

    const truncated = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x06, 1, 2, 3, 4]);
    expect(extractImageStructure(truncated, "JPEG")).toEqual([
      { name: "SOI · Start of image", size: 2 },
      { name: "APP1 · EXIF / XMP", size: 4 },
    ]);
  });

  it("excludes transparent pixels from average RGB and palette percentages", () => {
    // 2 opaque emerald pixels + 2 fully transparent pixels
    const pixels = new Uint8ClampedArray([
      20, 80, 60, 255, 20, 80, 60, 255, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const summary = summarizeRgbaPixels(pixels);
    expect(summary.averageRgb).toBe("20, 80, 60");
    expect(summary.palette[0]?.share).toBe(100);
  });

  it("preserves decoded dimensions even after ImageBitmap.close() detaches the bitmap", async () => {
    const fakeBitmap = {
      width: 2400,
      height: 1600,
      close() {
        this.width = 0;
        this.height = 0;
      },
    };

    const originalCreateBitmap = globalThis.createImageBitmap;
    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      writable: true,
      value: vi.fn().mockResolvedValue(fakeBitmap),
    });

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      return {
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(64 * 64 * 4) })),
      } as unknown as CanvasRenderingContext2D;
    });

    try {
      const sampleBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
      const file = new Blob([sampleBytes], { type: "image/jpeg" });
      const report = await analyzeImage(file, "diamond-ring.jpg", Date.now());

      expect(report.dimensions).toBe("2400 × 1600 px");
      expect(report.megapixels).toBe("3.84 MP");
      expect(report.resolution).toBe("2400 × 1600 px");
      const basic = report.sections.find((s) => s.title === "Basic metadata");
      expect(basic?.values.find((v) => v.label === "Dimensions")?.value).toBe("2400 × 1600 px");
    } finally {
      Object.defineProperty(globalThis, "createImageBitmap", {
        configurable: true,
        writable: true,
        value: originalCreateBitmap,
      });
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
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
