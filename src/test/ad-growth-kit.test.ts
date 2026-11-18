import { describe, expect, it } from "vitest";

import {
  buildAdLaunchPlaybook,
  buildGoogleAdsCsv,
  buildMetaAdsCsv,
  buildNegativeKeywordsText,
  buildProductAdKitRecord,
  buildWhatsappConciergeScripts,
  detectJewelryAttributes,
  formatCreativeSubline,
} from "@/lib/ad-growth-kit";
import { DEFAULT_BRAND_SEO } from "@/lib/seo-kit";

describe("Quiet-Luxury Ads & Conversion Kit", () => {
  it("accurately extracts 6D fine jewelry attributes without conflating lab-grown and natural", () => {
    const labRing = detectJewelryAttributes(
      "1.5ct Oval Lab-Grown Diamond Hidden Halo Engagement Ring in 18k Yellow Gold",
      "Engagement Ring",
      "IGI certified VS1 eye-clean stone",
    );
    expect(labRing).toEqual({
      shape: "Oval",
      carat: "1.5ct",
      setting: "Hidden Halo",
      metal: "18k Yellow Gold",
      origin: "Lab-Grown",
      certification: "IGI",
      category: "Engagement Ring",
    });

    const naturalRing = detectJewelryAttributes(
      "2ct Emerald Cut Natural Diamond Bezel Ring in Platinum PT950",
      "Ring",
      "GIA graded",
    );
    expect(naturalRing.origin).toBe("Natural");
    expect(naturalRing.certification).toBe("GIA");
    expect(naturalRing.metal).toBe("Platinum (PT950)");
    expect(formatCreativeSubline(labRing)).toBe("1.5CT  ·  OVAL  ·  18K YELLOW GOLD");
  });

  it("generates non-irritating quiet-luxury Meta ad copy, Exact/Phrase Google Ads keywords, and zero competitor branding", () => {
    const record = buildProductAdKitRecord({
      rawTitle: "Stienhardt 1.5ct Oval Lab-Grown Diamond Hidden Halo Ring",
      rawProductType: "Engagement Ring",
      rawDescription: "Crafted in 18k Yellow Gold with IGI certification",
      sourceVendor: "Stienhardt",
      storeOrigin: "https://stienhardt.com",
      folder: "1-5ct-oval-lab-grown-diamond-hidden-halo-ring",
      seoHandle: "1-5ct-oval-lab-grown-diamond-hidden-halo-ring",
      primaryImageFile:
        "1-5ct-oval-lab-grown-diamond-hidden-halo-ring/images/times-jewels-1-5ct-oval-01.webp",
      metaFeedCreative:
        "1-5ct-oval-lab-grown-diamond-hidden-halo-ring/ad-creatives/times-jewels-meta-feed-4x5.webp",
      storyCreative:
        "1-5ct-oval-lab-grown-diamond-hidden-halo-ring/ad-creatives/times-jewels-story-9x16.webp",
      brand: DEFAULT_BRAND_SEO,
    });

    expect(record.recommendedCta).toBe("Learn More");
    expect(record.metaHeadline.length).toBeLessThanOrEqual(40);
    expect(record.googleRsaHeadlines.every((h) => h.length <= 30)).toBe(true);
    expect(record.googleRsaDescriptions.every((d) => d.length <= 90)).toBe(true);
    expect(record.googleKeywordsExact.every((k) => k.startsWith("[") && k.endsWith("]"))).toBe(
      true,
    );
    expect(record.googleKeywordsPhrase.every((k) => k.startsWith('"') && k.endsWith('"'))).toBe(
      true,
    );

    const metaCsv = buildMetaAdsCsv([record]);
    expect(metaCsv).toContain("Times Jewels");
    expect(metaCsv).toContain("timesjewels.com");
    expect(metaCsv.toLowerCase()).not.toContain("stienhardt");

    const googleCsv = buildGoogleAdsCsv([record]);
    expect(googleCsv).toContain("[1.5ct oval diamond engagement ring]");
    expect(googleCsv.toLowerCase()).not.toContain("stienhardt");
  });

  it("produces budget-protecting negative keywords, WhatsApp VIP scripts, and launch playbook", () => {
    const negatives = buildNegativeKeywordsText();
    expect(negatives).toContain("cubic zirconia");
    expect(negatives).toContain("pawn shop");
    expect(negatives).toContain("fake diamond");

    const scripts = buildWhatsappConciergeScripts(DEFAULT_BRAND_SEO);
    expect(scripts).toContain("Times Jewels");
    expect(scripts).toContain("https://timesjewels.com");
    expect(scripts).toContain("30-day");

    const playbook = buildAdLaunchPlaybook(DEFAULT_BRAND_SEO, 5);
    expect(playbook).toContain("Times Jewels");
    expect(playbook).toContain("google-ads-negative-keywords.txt");
    expect(playbook).toContain("Learn More");
  });
});
