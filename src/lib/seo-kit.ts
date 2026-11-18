export type BrandSeoConfig = {
  brandName: string;
  brandDomain: string;
};

export const DEFAULT_BRAND_SEO: BrandSeoConfig = {
  brandName: "Times Jewels",
  brandDomain: "timesjewels.com",
};

export type ProductSeoRecord = {
  folder: string;
  handle: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  productType: string;
  brandName: string;
  targetUrl: string;
  images: Array<{
    filename: string;
    path: string;
    alt: string;
  }>;
  jsonLd: Record<string, unknown>;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeBrandDomain(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/[^a-z0-9.-]/g, "");
  return cleaned || DEFAULT_BRAND_SEO.brandDomain;
}

export function normalizeBrandName(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  return cleaned || DEFAULT_BRAND_SEO.brandName;
}

export function slugifySeo(value: string, maxLength = 64): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) return "fine-jewelry";
  if (normalized.length <= maxLength) return normalized;
  const sliced = normalized.slice(0, maxLength);
  const lastHyphen = sliced.lastIndexOf("-");
  return (lastHyphen > 20 ? sliced.slice(0, lastHyphen) : sliced).replace(/-+$/g, "");
}

function extractStoreBrandTokens(storeOrigin?: string): string[] {
  if (!storeOrigin) return [];
  try {
    const hostname = new URL(storeOrigin).hostname.toLowerCase().replace(/^www\./, "");
    const primary = hostname.split(".")[0] ?? "";
    const tokens = [hostname];
    if (primary.length >= 3 && primary !== "myshopify" && primary !== "shop") {
      tokens.push(primary);
    }
    return tokens;
  } catch {
    return [];
  }
}

export function stripSourceBrandText(
  text: string,
  sourceVendor?: string | null,
  storeOrigin?: string,
): string {
  let result = text.replace(/https?:\/\/\S+/gi, " ").trim();
  const removals: string[] = [];

  if (sourceVendor && sourceVendor.trim().length >= 2) {
    removals.push(sourceVendor.trim());
  }
  removals.push(...extractStoreBrandTokens(storeOrigin));
  removals.sort((a, b) => b.length - a.length);

  for (const token of removals) {
    const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`, "gi");
    result = result.replace(pattern, " ");
  }

  result = result
    .replace(/\s*[|–—-]\s*(?=[|–—-]|$)/g, " ")
    .replace(/^\s*[|–—:-]+\s*/, "")
    .replace(/\s*[|–—:-]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  return result || "Fine Diamond Jewelry Piece";
}

function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > Math.floor(maxLength * 0.55) ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[,;:\-–—\s]+$/, "")}…`;
}

export function buildSeoMetaTitle(cleanTitle: string, brandName: string): string {
  const brand = normalizeBrandName(brandName);
  const suffix = ` | ${brand}`;
  const full = `${cleanTitle}${suffix}`;
  if (full.length <= 60) return full;
  const allowedTitleLen = Math.max(24, 60 - suffix.length);
  return `${truncateAtWord(cleanTitle, allowedTitleLen)}${suffix}`;
}

export function buildSeoMetaDescription(
  cleanTitle: string,
  productType: string | null | undefined,
  brandName: string,
): string {
  const brand = normalizeBrandName(brandName);
  const category = productType?.trim();
  const intro =
    category && !cleanTitle.toLowerCase().includes(category.toLowerCase())
      ? `Discover the ${cleanTitle} (${category}) at ${brand}.`
      : `Discover the ${cleanTitle} at ${brand}.`;
  const closing = "Crafted in fine gold & platinum with certified brilliance and insured delivery.";
  const combined = `${intro} ${closing}`;
  if (combined.length <= 155) return combined;
  return truncateAtWord(
    `Shop the ${cleanTitle} at ${brand}. Fine jewelry crafted with certified brilliance, precision setting & insured delivery.`,
    155,
  );
}

const IMAGE_ANGLE_LABELS = [
  "primary studio view",
  "side profile & setting detail",
  "alternate angle view",
  "close-up craft detail",
  "gallery view",
];

export function buildImageAltText(cleanTitle: string, brandName: string, index: number): string {
  const brand = normalizeBrandName(brandName);
  const angle = IMAGE_ANGLE_LABELS[index] ?? `detail view ${index + 1}`;
  return `${cleanTitle} — ${angle} | ${brand}`;
}

export function buildProductSeoRecord(params: {
  rawTitle: string;
  rawProductType?: string | null | undefined;
  sourceVendor?: string | null | undefined;
  storeOrigin?: string | undefined;
  priceCents?: number | null | undefined;
  folder: string;
  seoHandle: string;
  imagePaths: string[];
  brand: BrandSeoConfig;
}): ProductSeoRecord {
  const brandName = normalizeBrandName(params.brand.brandName);
  const brandDomain = normalizeBrandDomain(params.brand.brandDomain);
  const cleanTitle = stripSourceBrandText(params.rawTitle, params.sourceVendor, params.storeOrigin);
  const cleanType = params.rawProductType
    ? stripSourceBrandText(params.rawProductType, params.sourceVendor, params.storeOrigin)
    : "Fine Jewelry";
  const handle = slugifySeo(params.seoHandle || cleanTitle, 64);
  const targetUrl = `https://${brandDomain}/products/${handle}`;
  const metaTitle = buildSeoMetaTitle(cleanTitle, brandName);
  const metaDescription = buildSeoMetaDescription(cleanTitle, cleanType, brandName);

  const images = params.imagePaths.map((relativePath, index) => {
    const filename = relativePath.split("/").pop() ?? relativePath;
    return {
      filename,
      path: relativePath,
      alt: buildImageAltText(cleanTitle, brandName, index),
    };
  });

  const offers: Record<string, unknown> = {
    "@type": "Offer",
    url: targetUrl,
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    seller: {
      "@type": "Organization",
      name: brandName,
      url: `https://${brandDomain}`,
    },
  };
  if (
    typeof params.priceCents === "number" &&
    Number.isFinite(params.priceCents) &&
    params.priceCents > 0
  ) {
    offers["price"] = (params.priceCents / 100).toFixed(2);
  }

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: cleanTitle,
    description: metaDescription,
    category: cleanType,
    brand: {
      "@type": "Brand",
      name: brandName,
    },
    url: targetUrl,
    image: images.map((img) => `https://${brandDomain}/images/${img.filename}`),
    offers,
  };

  return {
    folder: params.folder,
    handle,
    title: cleanTitle,
    metaTitle,
    metaDescription,
    productType: cleanType,
    brandName,
    targetUrl,
    images,
    jsonLd,
  };
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildSeoKitCsv(records: ProductSeoRecord[]): string {
  const headers = [
    "Folder",
    "Handle",
    "SEO Title",
    "Meta Title (<=60)",
    "Meta Description (<=155)",
    "Product Type",
    "Brand",
    "Image Files",
    "Image Alt Texts",
    "Target Product URL",
    "JSON-LD Schema",
  ];

  const rows = records.map((record) =>
    [
      record.folder,
      record.handle,
      record.title,
      record.metaTitle,
      record.metaDescription,
      record.productType,
      record.brandName,
      record.images.map((img) => img.filename).join(" | "),
      record.images.map((img) => img.alt).join(" | "),
      record.targetUrl,
      JSON.stringify(record.jsonLd),
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  // Prefix with UTF-8 BOM so Excel and Google Sheets open Unicode punctuation cleanly.
  return `\uFEFF${[headers.map(escapeCsvCell).join(","), ...rows].join("\r\n")}\r\n`;
}
