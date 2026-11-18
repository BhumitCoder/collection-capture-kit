import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeImage,
  detectImageFormat,
  extractImageStructure,
  formatBytes,
  metadataFreeFilename,
  sanitizeImageBytes,
  stripJpegMetadata,
  stripPngMetadata,
  stripSvgMetadata,
  stripWebpMetadata,
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

  it("strips EXIF, ICC, C2PA, Photoshop, Adobe, comments and trailing bytes from JPEG", () => {
    const jpegWithMetadata = new Uint8Array([
      0xff,
      0xd8, // SOI
      // APP0 JFIF with custom DPI (300x300) and thumbnail
      0xff,
      0xe0,
      0x00,
      0x10,
      0x4a,
      0x46,
      0x49,
      0x46,
      0x00,
      0x01,
      0x01,
      0x01,
      0x01,
      0x2c,
      0x01,
      0x2c,
      0x00,
      0x00,
      // APP1 EXIF/XMP
      0xff,
      0xe1,
      0x00,
      0x06,
      0x45,
      0x78,
      0x69,
      0x66,
      // APP2 ICC
      0xff,
      0xe2,
      0x00,
      0x05,
      0x49,
      0x43,
      0x43,
      // APP11 C2PA / JUMBF
      0xff,
      0xeb,
      0x00,
      0x06,
      0x6a,
      0x75,
      0x6d,
      0x62,
      // APP13 Photoshop / IPTC
      0xff,
      0xed,
      0x00,
      0x05,
      0x50,
      0x53,
      0x44,
      // APP14 Adobe
      0xff,
      0xee,
      0x00,
      0x04,
      0x41,
      0x44,
      // COM Comment
      0xff,
      0xfe,
      0x00,
      0x05,
      0x68,
      0x69,
      0x21,
      // DQT (kept)
      0xff,
      0xdb,
      0x00,
      0x04,
      0x00,
      0x10,
      // SOS + scan data with stuffed 0xFF 0x00 and RST0 (0xFF 0xD0)
      0xff,
      0xda,
      0x00,
      0x04,
      0x01,
      0x00,
      0xaa,
      0xff,
      0x00,
      0xbb,
      0xff,
      0xd0,
      0xcc,
      // EOI
      0xff,
      0xd9,
      // Trailing hidden payload after EOI (must be truncated)
      0xde,
      0xad,
      0xbe,
      0xef,
    ]);

    const cleaned = stripJpegMetadata(jpegWithMetadata);
    const structure = extractImageStructure(cleaned, "JPEG");

    expect(structure.map((s) => s.name)).toEqual([
      "SOI · Start of image",
      "APP0 · JFIF",
      "Image scan data",
      "EOI · End of image",
    ]);
    // Verify scan data with byte stuffing & RST0 survived and trailing bytes were cut off
    expect(cleaned.slice(-2)).toEqual(new Uint8Array([0xff, 0xd9]));
    expect(cleaned.length).toBeLessThan(jpegWithMetadata.length);
  });

  it("strips PNG text, EXIF, ICC, timestamp and trailing chunks while preserving critical chunks", () => {
    const makeChunk = (type: string, data: number[]) => {
      const buf = new Uint8Array(12 + data.length);
      const view = new DataView(buf.buffer);
      view.setUint32(0, data.length, false);
      for (let i = 0; i < 4; i += 1) buf[4 + i] = type.charCodeAt(i);
      buf.set(data, 8);
      return buf;
    };
    const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const parts = [
      sig,
      makeChunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]),
      makeChunk("iCCP", [1, 2, 3]),
      makeChunk("eXIf", [4, 5, 6]),
      makeChunk("tEXt", [65, 66, 67]),
      makeChunk("tIME", [7, 234, 1, 1, 0, 0, 0]),
      makeChunk("pHYs", [0, 0, 11, 19, 0, 0, 11, 19, 1]),
      makeChunk("IDAT", [9, 9]),
      makeChunk("IEND", []),
      new Uint8Array([1, 2, 3, 4]), // trailing junk
    ];
    const total = parts.reduce((sum, p) => sum + p.length, 0);
    const png = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      png.set(part, offset);
      offset += part.length;
    }

    const cleaned = stripPngMetadata(png);
    const structure = extractImageStructure(cleaned, "PNG");
    expect(structure.map((s) => s.name)).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("strips WebP EXIF, XMP and ICCP chunks and clears VP8X metadata flags", () => {
    const makeWebpChunk = (fourCC: string, payload: number[]) => {
      const padded = payload.length + (payload.length % 2);
      const buf = new Uint8Array(8 + padded);
      for (let i = 0; i < 4; i += 1) buf[i] = fourCC.charCodeAt(i);
      new DataView(buf.buffer).setUint32(4, payload.length, true);
      buf.set(payload, 8);
      return buf;
    };

    // VP8X flags: ICC (0x20) | Alpha (0x10) | EXIF (0x08) | XMP (0x04) = 0x3c
    const vp8x = makeWebpChunk("VP8X", [0x3c, 0, 0, 0, 1, 0, 0, 1, 0, 0]);
    const iccp = makeWebpChunk("ICCP", [1, 2, 3]);
    const vp8 = makeWebpChunk("VP8 ", [10, 20, 30, 40]);
    const exif = makeWebpChunk("EXIF", [5, 6, 7]);
    const xmp = makeWebpChunk("XMP ", [8, 9]);

    const bodyLen = 4 + vp8x.length + iccp.length + vp8.length + exif.length + xmp.length;
    const webp = new Uint8Array(8 + bodyLen);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    new DataView(webp.buffer).setUint32(4, bodyLen, true);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    let pos = 12;
    for (const chunk of [vp8x, iccp, vp8, exif, xmp]) {
      webp.set(chunk, pos);
      pos += chunk.length;
    }

    const cleaned = stripWebpMetadata(webp);
    const structure = extractImageStructure(cleaned, "WebP");
    expect(structure.map((s) => s.name)).toEqual(["VP8X", "VP8 "]);
    // Alpha flag (0x10) preserved; ICC/EXIF/XMP flags cleared
    expect(cleaned[20]).toBe(0x10);
  });

  it("strips SVG comments, metadata, title, desc and editor attributes", () => {
    const svg = new TextEncoder().encode(
      `<!-- Created with Illustrator --><svg inkscape:version="1.2"><metadata>secret</metadata><title>Ring</title><desc>Brand</desc><circle r="5"/></svg>`,
    );
    const cleaned = new TextDecoder().decode(stripSvgMetadata(svg));
    expect(cleaned).toBe(`<svg><circle r="5"/></svg>`);
  });

  it("sanitizes image bytes cleanly even when browser canvas decoding falls back", async () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66, 0xff, 0xda, 0x00, 0x04, 0x01,
      0x00, 0xaa, 0xff, 0xd9,
    ]);
    const result = await sanitizeImageBytes(jpeg, "image/jpeg");
    expect(result.mimeType).toBe("image/jpeg");
    const structure = extractImageStructure(result.bytes, "JPEG");
    expect(structure.some((s) => s.name.includes("EXIF"))).toBe(false);
  });
});
