import { describe, expect, it } from "vitest";

import {
  buildImageAltText,
  buildProductSeoRecord,
  buildSeoKitCsv,
  buildSeoMetaDescription,
  buildSeoMetaTitle,
  DEFAULT_BRAND_SEO,
  normalizeBrandDomain,
  slugifySeo,
  stripSourceBrandText,
} from "@/lib/seo-kit";

describe("Times Jewels SEO kit generator", () => {
  it("strips source vendor and store domain tokens from titles cleanly", () => {
    expect(
      stripSourceBrandText(
        "Stienhardt 1.5ct Oval Diamond Hidden Halo Ring - stienhardt.com",
        "Stienhardt",
        "https://stienhardt.com",
      ),
    ).toBe("1.5ct Oval Diamond Hidden Halo Ring");
  });

  it("normalizes brand domains and generates concise SEO slugs", () => {
    expect(normalizeBrandDomain("https://www.TimesJewels.com/collections/rings")).toBe(
      "timesjewels.com",
    );
    expect(slugifySeo("18k Émerald Cut Diamond Solitaire Ring!")).toBe(
      "18k-emerald-cut-diamond-solitaire-ring",
    );
  });

  it("keeps Meta Title <= 60 chars and Meta Description <= 155 chars", () => {
    const title = buildSeoMetaTitle(
      "2.0ct Radiant Cut Lab-Grown Diamond Hidden Halo Engagement Ring in 18k Yellow Gold",
      DEFAULT_BRAND_SEO.brandName,
    );
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title).toContain("| Times Jewels");

    const desc = buildSeoMetaDescription(
      "2.0ct Radiant Cut Lab-Grown Diamond Hidden Halo Engagement Ring in 18k Yellow Gold",
      "Engagement Ring",
      DEFAULT_BRAND_SEO.brandName,
    );
    expect(desc.length).toBeLessThanOrEqual(155);
    expect(desc).toContain("Times Jewels");
  });

  it("builds unique per-angle alt texts, Product JSON-LD, and Excel-safe CSV", () => {
    expect(buildImageAltText("Oval Solitaire Ring", "Times Jewels", 0)).toContain(
      "primary studio view",
    );
    expect(buildImageAltText("Oval Solitaire Ring", "Times Jewels", 1)).toContain(
      "side profile & setting detail",
    );

    const record = buildProductSeoRecord({
      rawTitle: "Stienhardt 1.5ct Oval Solitaire Ring",
      rawProductType: "Engagement Ring",
      sourceVendor: "Stienhardt",
      storeOrigin: "https://stienhardt.com",
      priceCents: 325000,
      folder: "1-5ct-oval-solitaire-ring",
      seoHandle: "1-5ct-oval-solitaire-ring",
      imagePaths: [
        "images/times-jewels-1-5ct-oval-solitaire-ring-01.webp",
        "images/times-jewels-1-5ct-oval-solitaire-ring-02.webp",
      ],
      brand: DEFAULT_BRAND_SEO,
    });

    expect(record.title).toBe("1.5ct Oval Solitaire Ring");
    expect(record.targetUrl).toBe("https://timesjewels.com/products/1-5ct-oval-solitaire-ring");
    expect(record.jsonLd["@type"]).toBe("Product");
    expect(record.jsonLd["brand"]).toEqual({ "@type": "Brand", name: "Times Jewels" });
    expect(JSON.stringify(record.jsonLd).toLowerCase()).not.toContain("stienhardt");

    const csv = buildSeoKitCsv([record]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("timesjewels.com/products/1-5ct-oval-solitaire-ring");
    expect(csv).toContain("times-jewels-1-5ct-oval-solitaire-ring-01.webp");
    expect(csv.toLowerCase()).not.toContain("stienhardt");
  });
});
