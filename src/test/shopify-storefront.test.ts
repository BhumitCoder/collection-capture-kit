import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";

import { extractImageStructure } from "@/lib/image-forensics";
import {
  createProductsArchive,
  DEFAULT_SEO_CLEAN_OPTIONS,
  FULL_CLEAN_OPTIONS,
  getArchiveDownloadFilename,
  getBestMp4Source,
  getHighResolutionImageUrl,
  getProductAssets,
  getStoreOrigin,
  NEUTRAL_ZIP_DATE,
  safeAssetName,
  type ShopifyCollection,
  type ShopifyProductDetail,
} from "@/lib/shopify-storefront";

describe("shopify storefront helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes store origins and throws friendly errors for invalid input", () => {
    expect(getStoreOrigin("stienhardt.com/collections/rings")).toBe("https://stienhardt.com");
    expect(getStoreOrigin("http://example-jeweler.myshopify.com/products")).toBe(
      "https://example-jeweler.myshopify.com",
    );
    expect(() => getStoreOrigin("")).toThrow("Enter a valid Shopify storefront address.");
    expect(() => getStoreOrigin("not a valid url")).toThrow(
      "Enter a valid Shopify storefront address.",
    );
  });

  it("strips Shopify query sizing params and legacy filename size suffixes", () => {
    expect(
      getHighResolutionImageUrl(
        "//cdn.shopify.com/s/files/1/ring_800x800_crop_center@2x.jpg?v=123&width=600&quality=80",
      ),
    ).toBe("https://cdn.shopify.com/s/files/1/ring.jpg?v=123");

    expect(
      getHighResolutionImageUrl("https://cdn.shopify.com/s/files/1/necklace_grande.webp"),
    ).toBe("https://cdn.shopify.com/s/files/1/necklace.webp");
  });

  it("selects the highest-resolution MP4 stream and normalizes protocol-relative URLs", () => {
    const best = getBestMp4Source([
      { format: "m3u8", height: 2160, url: "//cdn.shopify.com/v/master.m3u8" },
      { format: "mp4", height: 720, width: 1280, url: "//cdn.shopify.com/v/720.mp4" },
      { format: "mp4", height: 1080, width: 1920, url: "//cdn.shopify.com/v/1080.mp4" },
    ]);
    expect(best?.url).toBe("https://cdn.shopify.com/v/1080.mp4");
    expect(best?.height).toBe(1080);
  });

  it("extracts images from Shopify .js string[] fallback when media is empty", () => {
    const detail: ShopifyProductDetail = {
      id: 1,
      title: "Oval Solitaire",
      handle: "oval-solitaire",
      images: [
        "//cdn.shopify.com/s/files/1/solitaire_600x.jpg?v=1",
        "//cdn.shopify.com/s/files/1/solitaire-side_medium.png",
      ],
    };

    const assets = getProductAssets(detail, "https://stienhardt.com");
    expect(assets).toHaveLength(2);
    expect(assets[0]?.url).toBe("https://cdn.shopify.com/s/files/1/solitaire.jpg?v=1");
    expect(assets[1]?.url).toBe("https://cdn.shopify.com/s/files/1/solitaire-side.png");
  });

  it("sanitizes folder and file names safely", () => {
    expect(safeAssetName("18k Émerald & Diamond Ring!")).toBe("18k-emerald-diamond-ring");
    expect(safeAssetName("///")).toBe("asset");
  });

  it("builds a product-folder ZIP archive and aligns product.json paths with actual MIME extensions", async () => {
    const collection: ShopifyCollection = {
      id: 10,
      title: "Engagement Rings",
      handle: "engagement-rings",
      products_count: 1,
      image: { src: "https://cdn.shopify.com/s/files/1/cover.jpg" },
    };

    const detailPayload: ShopifyProductDetail = {
      id: 101,
      title: "Radiant Halo Ring",
      handle: "radiant-halo-ring",
      vendor: "Stienhardt",
      type: "Engagement Ring",
      price: 425000,
      media: [
        {
          id: 1,
          media_type: "image",
          src: "//cdn.shopify.com/s/files/1/halo_800x.jpg",
        },
        {
          id: 2,
          media_type: "video",
          sources: [{ format: "mp4", height: 1080, url: "//cdn.shopify.com/v/halo-1080.mp4" }],
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/shopify?")) {
        return new Response(JSON.stringify(detailPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("halo.jpg")) {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "image/webp" },
        });
      }
      if (url.includes("halo-1080.mp4")) {
        return new Response(new Uint8Array([4, 5, 6]), {
          status: 200,
          headers: { "Content-Type": "video/mp4" },
        });
      }
      return new Response(new Uint8Array([7, 8]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      });
    });

    const { blob, result } = await createProductsArchive(
      "https://stienhardt.com",
      collection,
      [{ id: 101, title: "Radiant Halo Ring", handle: "radiant-halo-ring", images: [] }],
      () => {},
    );

    expect(result).toEqual({ files: 3, skipped: 0, products: 1 });

    const zipBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    const archive = await JSZip.loadAsync(zipBytes);
    const files = Object.keys(archive.files);
    expect(files).toContain("engagement-rings/manifest.json");
    expect(files).toContain("engagement-rings/collection-cover.jpg");
    expect(files).toContain(
      "engagement-rings/products/radiant-halo-ring/images/01-radiant-halo-ring.webp",
    );
    expect(files).toContain(
      "engagement-rings/products/radiant-halo-ring/videos/01-radiant-halo-ring-1080p.mp4",
    );

    const productJsonText = await archive
      .file("engagement-rings/products/radiant-halo-ring/product.json")
      ?.async("text");
    const productJson = JSON.parse(productJsonText ?? "{}") as {
      productType: string | null;
      media: Array<{ path: string; downloaded: boolean }>;
    };
    expect(productJson.productType).toBe("Engagement Ring");
    expect(productJson.media[0]?.path).toBe("images/01-radiant-halo-ring.webp");
    expect(productJson.media[0]?.downloaded).toBe(true);
  });

  it("cleans image metadata, filenames, JSON footprints, and ZIP dates when FULL_CLEAN_OPTIONS is enabled", async () => {
    const collection: ShopifyCollection = {
      id: 10,
      title: "Engagement Rings",
      handle: "engagement-rings",
      products_count: 1,
      image: { src: "https://cdn.shopify.com/s/files/1/stienhardt-cover.jpg" },
    };

    const detailPayload: ShopifyProductDetail = {
      id: 101,
      title: "Radiant Halo Ring",
      handle: "stienhardt-radiant-halo-ring",
      vendor: "Stienhardt",
      type: "Engagement Ring",
      media: [
        {
          id: 1,
          media_type: "image",
          src: "//cdn.shopify.com/s/files/1/stienhardt-halo_800x.jpg",
        },
        {
          id: 2,
          media_type: "video",
          sources: [{ format: "mp4", height: 1080, url: "//cdn.shopify.com/v/halo-1080.mp4" }],
        },
      ],
    };

    // JPEG containing EXIF (APP1), C2PA (APP11), Photoshop (APP13), Comment (COM), and trailing bytes
    const dirtyJpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66, 0xff, 0xeb, 0x00, 0x06, 0x63,
      0x32, 0x70, 0x61, 0xff, 0xed, 0x00, 0x05, 0x50, 0x53, 0x44, 0xff, 0xfe, 0x00, 0x05, 0x73,
      0x65, 0x63, 0xff, 0xda, 0x00, 0x04, 0x01, 0x00, 0x11, 0x22, 0xff, 0xd9, 0x99, 0x88,
    ]);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/shopify?")) {
        return new Response(JSON.stringify(detailPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("halo-1080.mp4")) {
        return new Response(new Uint8Array([4, 5, 6]), {
          status: 200,
          headers: { "Content-Type": "video/mp4" },
        });
      }
      return new Response(dirtyJpeg, {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      });
    });

    const { blob, result } = await createProductsArchive(
      "https://stienhardt.com",
      collection,
      [{ id: 101, title: "Radiant Halo Ring", handle: "stienhardt-radiant-halo-ring", images: [] }],
      () => {},
      undefined,
      FULL_CLEAN_OPTIONS,
    );

    expect(result).toEqual({ files: 3, skipped: 0, products: 1, cleanedImages: 2 });

    const zipBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    const archive = await JSZip.loadAsync(zipBytes);
    const files = Object.keys(archive.files).filter((name) => !archive.files[name]?.dir);

    // Neutral filenames with zero store/collection/product handle leakage
    expect(files.sort()).toEqual([
      "clean-media/cover.jpg",
      "clean-media/item-01/images/image-01.jpg",
      "clean-media/item-01/videos/video-01.mp4",
    ]);
    expect(files.some((name) => name.includes("stienhardt") || name.includes("engagement"))).toBe(
      false,
    );
    expect(files.some((name) => name.endsWith(".json"))).toBe(false);

    // Every image in the ZIP is stripped of EXIF, C2PA, Photoshop, comments & trailing bytes
    const productImageBytes = await archive
      .file("clean-media/item-01/images/image-01.jpg")
      ?.async("uint8array");
    expect(productImageBytes).toBeDefined();
    const productStructure = extractImageStructure(productImageBytes!, "JPEG");
    expect(productStructure.map((s) => s.name)).toEqual([
      "SOI · Start of image",
      "Image scan data",
      "EOI · End of image",
    ]);

    const coverBytes = await archive.file("clean-media/cover.jpg")?.async("uint8array");
    expect(coverBytes).toBeDefined();
    const coverStructure = extractImageStructure(coverBytes!, "JPEG");
    expect(coverStructure.map((s) => s.name)).toEqual([
      "SOI · Start of image",
      "Image scan data",
      "EOI · End of image",
    ]);

    // ZIP entry timestamps neutralized
    for (const entry of Object.values(archive.files)) {
      expect(entry.date.getUTCFullYear()).toBe(NEUTRAL_ZIP_DATE.getUTCFullYear());
      expect(entry.date.getUTCMonth()).toBe(NEUTRAL_ZIP_DATE.getUTCMonth());
      expect(entry.date.getUTCDate()).toBe(NEUTRAL_ZIP_DATE.getUTCDate());
    }
  });

  it("exports Times Jewels SEO archive with brand SEO filenames, seo-import.csv, JSON-LD, and zero source footprint", async () => {
    expect(getArchiveDownloadFilename("engagement-rings", DEFAULT_SEO_CLEAN_OPTIONS)).toBe(
      "times-jewels-seo-export.zip",
    );

    const collection: ShopifyCollection = {
      id: 10,
      title: "Engagement Rings",
      handle: "engagement-rings",
      products_count: 1,
      image: null,
    };

    const detailPayload: ShopifyProductDetail = {
      id: 202,
      title: "Stienhardt 1.5ct Oval Solitaire Ring",
      handle: "stienhardt-oval-solitaire",
      vendor: "Stienhardt",
      type: "Engagement Ring",
      price: 295000,
      media: [
        {
          id: 1,
          media_type: "image",
          src: "//cdn.shopify.com/s/files/1/stienhardt-oval.jpg",
        },
      ],
    };

    const dirtyJpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66, 0xff, 0xda, 0x00, 0x04, 0x01,
      0x00, 0x11, 0x22, 0xff, 0xd9,
    ]);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/shopify?")) {
        return new Response(JSON.stringify(detailPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(dirtyJpeg, {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      });
    });

    const { blob, result } = await createProductsArchive(
      "https://stienhardt.com",
      collection,
      [
        {
          id: 202,
          title: "Stienhardt 1.5ct Oval Solitaire Ring",
          handle: "stienhardt-oval-solitaire",
          images: [],
        },
      ],
      () => {},
      undefined,
      DEFAULT_SEO_CLEAN_OPTIONS,
    );

    expect(result).toEqual({
      files: 1,
      skipped: 0,
      products: 1,
      cleanedImages: 1,
      seoKitIncluded: true,
      adKitIncluded: true,
      adCreativesCreated: 0,
    });

    const zipBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    const archive = await JSZip.loadAsync(zipBytes);
    const files = Object.keys(archive.files).filter((name) => !archive.files[name]?.dir);

    expect(files.sort()).toEqual([
      "times-jewels/1-5ct-oval-solitaire-ring/images/times-jewels-1-5ct-oval-solitaire-ring-01.jpg",
      "times-jewels/ad-growth-kit/START-HERE-AD-PLAYBOOK.md",
      "times-jewels/ad-growth-kit/google-ads-keywords.csv",
      "times-jewels/ad-growth-kit/google-ads-negative-keywords.txt",
      "times-jewels/ad-growth-kit/meta-instagram-ads.csv",
      "times-jewels/ad-growth-kit/whatsapp-vip-concierge-scripts.txt",
      "times-jewels/seo-kit/product-schemas.json",
      "times-jewels/seo-kit/seo-import.csv",
    ]);

    const csvText = await archive.file("times-jewels/seo-kit/seo-import.csv")?.async("text");
    expect(csvText).toContain("https://timesjewels.com/products/1-5ct-oval-solitaire-ring");
    expect(csvText).toContain("Times Jewels");
    expect(csvText?.toLowerCase()).not.toContain("stienhardt");

    const metaAdsText = await archive
      .file("times-jewels/ad-growth-kit/meta-instagram-ads.csv")
      ?.async("text");
    expect(metaAdsText).toContain("Learn More");
    expect(metaAdsText).toContain("timesjewels.com");
    expect(metaAdsText?.toLowerCase()).not.toContain("stienhardt");

    const schemaText = await archive
      .file("times-jewels/seo-kit/product-schemas.json")
      ?.async("text");
    expect(schemaText).toContain("timesjewels.com");
    expect(schemaText?.toLowerCase()).not.toContain("stienhardt");
  });
});
