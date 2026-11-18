import {
  normalizeBrandDomain,
  normalizeBrandName,
  slugifySeo,
  stripSourceBrandText,
  type BrandSeoConfig,
} from "@/lib/seo-kit";

export type JewelryAttributes = {
  shape: string | null;
  carat: string | null;
  setting: string | null;
  metal: string | null;
  origin: "Lab-Grown" | "Natural" | null;
  certification: "IGI" | "GIA" | null;
  category: string;
};

export type ProductAdKitRecord = {
  folder: string;
  handle: string;
  cleanTitle: string;
  targetUrl: string;
  attributes: JewelryAttributes;
  primaryImageFile: string;
  metaFeedCreative: string;
  storyCreative: string;
  metaAngleAspiration: string;
  metaAngleTransparency: string;
  metaAngleZeroRisk: string;
  metaHeadline: string;
  metaDescription: string;
  recommendedCta: string;
  instagramCaption: string;
  hashtags: string;
  googleKeywordsExact: string[];
  googleKeywordsPhrase: string[];
  googleRsaHeadlines: string[];
  googleRsaDescriptions: string[];
};

const SHAPE_PATTERNS: Array<[RegExp, string]> = [
  [/\bround(?:\s+brilliant)?\b/i, "Round Brilliant"],
  [/\boval\b/i, "Oval"],
  [/\bemerald(?:\s+cut)?\b/i, "Emerald Cut"],
  [/\bradiant\b/i, "Radiant"],
  [/\bcushion\b/i, "Cushion"],
  [/\bpear\b/i, "Pear"],
  [/\bmarquise\b/i, "Marquise"],
  [/\basscher\b/i, "Asscher"],
  [/\bprincess\b/i, "Princess"],
  [/\bheart\b/i, "Heart"],
  [/\bbaguette\b/i, "Baguette"],
];

const SETTING_PATTERNS: Array<[RegExp, string]> = [
  [/\bhidden\s+halo\b/i, "Hidden Halo"],
  [/\btoi\s+et\s+moi\b/i, "Toi et Moi"],
  [/\b(?:three|3)[\s-]?stone\b/i, "Three-Stone"],
  [/\beveryday\b/i, "Everyday Fine"],
  [/\bsolitaire\b/i, "Solitaire"],
  [/\bbezel\b/i, "Bezel"],
  [/\bhalo\b/i, "Halo"],
  [/\bpav[eé]\b/i, "Pavé"],
  [/\beternity\b/i, "Eternity"],
  [/\bcathedral\b/i, "Cathedral"],
  [/\beast[\s-]?west\b/i, "East-West"],
  [/\btennis\b/i, "Tennis"],
  [/\bvintage|art\s+deco\b/i, "Vintage Art Deco"],
];

const METAL_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:platinum|pt\s*950)\b/i, "Platinum (PT950)"],
  [/\b18k\s+yellow\s+gold\b/i, "18k Yellow Gold"],
  [/\b18k\s+white\s+gold\b/i, "18k White Gold"],
  [/\b18k\s+rose\s+gold\b/i, "18k Rose Gold"],
  [/\b18k\s+gold\b/i, "18k Gold"],
  [/\b14k\s+yellow\s+gold\b/i, "14k Yellow Gold"],
  [/\b14k\s+white\s+gold\b/i, "14k White Gold"],
  [/\b14k\s+rose\s+gold\b/i, "14k Rose Gold"],
  [/\b14k\s+gold\b/i, "14k Gold"],
  [/\byellow\s+gold\b/i, "18k Yellow Gold"],
  [/\bwhite\s+gold\b/i, "18k White Gold"],
  [/\brose\s+gold\b/i, "18k Rose Gold"],
  [/\bvermeil\b/i, "Gold Vermeil"],
  [/\b(?:925|sterling\s+silver)\b/i, "Sterling Silver (925)"],
];

const CATEGORY_PATTERNS: Array<[RegExp, string]> = [
  [/\bengagement\s+ring\b/i, "Engagement Ring"],
  [/\bwedding\s+band\b/i, "Wedding Band"],
  [/\btennis\s+bracelet\b/i, "Tennis Bracelet"],
  [/\bbracelet|bangle\b/i, "Fine Bracelet"],
  [/\bstuds?|earrings?|hoops?\b/i, "Diamond Earrings"],
  [/\bnecklace|pendant|chain\b/i, "Fine Necklace"],
  [/\bring|band\b/i, "Diamond Ring"],
];

function matchFirst(text: string, pairs: Array<[RegExp, string]>): string | null {
  for (const [pattern, label] of pairs) {
    if (pattern.test(text)) return label;
  }
  return null;
}

export function detectJewelryAttributes(
  title: string,
  productType?: string | null,
  description?: string | null,
): JewelryAttributes {
  const combined = `${title} ${productType ?? ""} ${description ?? ""}`;
  const shape = matchFirst(combined, SHAPE_PATTERNS);
  const setting = matchFirst(combined, SETTING_PATTERNS);
  const metal = matchFirst(combined, METAL_PATTERNS);
  const category = matchFirst(`${title} ${productType ?? ""}`, CATEGORY_PATTERNS) ?? "Fine Jewelry";

  const caratMatch = combined.match(/\b(\d+(?:\.\d{1,2})?)\s*(?:ctw?|carats?)\b/i);
  const carat = caratMatch?.[1] ? `${caratMatch[1]}ct` : null;

  const isLab = /\b(?:lab[\s-]?grown|lab[\s-]?created|cvd|hpht)\b/i.test(combined);
  const isNatural = /\b(?:natural|earth[\s-]?mined)\b/i.test(combined);
  const origin: "Lab-Grown" | "Natural" | null = isLab ? "Lab-Grown" : isNatural ? "Natural" : null;

  const hasGia = /\bgia\b/i.test(combined);
  const hasIgi = /\bigi\b/i.test(combined);
  const certification: "IGI" | "GIA" | null = hasGia
    ? "GIA"
    : hasIgi
      ? "IGI"
      : origin === "Lab-Grown"
        ? "IGI"
        : origin === "Natural"
          ? "GIA"
          : null;

  return {
    shape,
    carat,
    setting,
    metal,
    origin,
    certification,
    category,
  };
}

function clampLength(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = lastSpace > Math.floor(max * 0.5) ? cut.slice(0, lastSpace) : cut;
  return `${trimmed.replace(/[,;:\-–—\s]+$/, "")}`;
}

export function formatCreativeSubline(attributes: JewelryAttributes): string {
  const parts: string[] = [];
  if (attributes.carat) parts.push(attributes.carat.toUpperCase());
  if (attributes.shape) parts.push(attributes.shape.toUpperCase());
  if (attributes.metal) parts.push(attributes.metal.toUpperCase());
  if (attributes.certification) parts.push(`${attributes.certification} CERTIFIED`);
  if (parts.length === 0) {
    parts.push(attributes.category.toUpperCase(), "FINE CRAFTSMANSHIP");
  }
  return parts.slice(0, 3).join("  ·  ");
}

function buildKeywordsForProduct(
  cleanTitle: string,
  attributes: JewelryAttributes,
): { exact: string[]; phrase: string[] } {
  const baseTerms = new Set<string>();
  const shape = attributes.shape?.toLowerCase();
  const setting = attributes.setting?.toLowerCase();
  const metal = attributes.metal?.toLowerCase().replace(/\s*\([^)]*\)/g, "");
  const carat = attributes.carat?.toLowerCase();
  const origin = attributes.origin?.toLowerCase();
  const category = attributes.category.toLowerCase();

  const normalizedTitle = cleanTitle
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalizedTitle.split(" ").length <= 8) {
    baseTerms.add(normalizedTitle);
  }

  if (shape && setting) baseTerms.add(`${shape} ${setting} ${category}`);
  if (carat && shape) baseTerms.add(`${carat} ${shape} diamond ${category}`);
  if (shape && metal) baseTerms.add(`${shape} diamond ${category} ${metal}`);
  if (origin && shape) baseTerms.add(`${origin} ${shape} diamond ${category}`);
  if (setting && metal) baseTerms.add(`${setting} ${category} ${metal}`);
  if (carat && setting) baseTerms.add(`buy ${carat} ${setting} diamond ${category}`);
  if (attributes.certification && shape) {
    baseTerms.add(
      `${attributes.certification.toLowerCase()} certified ${shape} diamond ${category}`,
    );
  }
  if (baseTerms.size < 3) {
    baseTerms.add(`buy ${category} online`);
    baseTerms.add(`fine ${category} ${metal ?? "18k gold"}`);
    baseTerms.add(`certified diamond ${category}`);
  }

  const list = Array.from(baseTerms).slice(0, 7);
  return {
    exact: list.map((term) => `[${term}]`),
    phrase: list.map((term) => `"${term}"`),
  };
}

export function buildProductAdKitRecord(params: {
  rawTitle: string;
  rawProductType?: string | null | undefined;
  rawDescription?: string | null | undefined;
  sourceVendor?: string | null | undefined;
  storeOrigin?: string | undefined;
  folder: string;
  seoHandle: string;
  primaryImageFile: string;
  metaFeedCreative: string;
  storyCreative: string;
  brand: BrandSeoConfig;
}): ProductAdKitRecord {
  const brandName = normalizeBrandName(params.brand.brandName);
  const brandDomain = normalizeBrandDomain(params.brand.brandDomain);
  const cleanTitle = stripSourceBrandText(params.rawTitle, params.sourceVendor, params.storeOrigin);
  const cleanType = params.rawProductType
    ? stripSourceBrandText(params.rawProductType, params.sourceVendor, params.storeOrigin)
    : null;
  const attributes = detectJewelryAttributes(cleanTitle, cleanType, params.rawDescription);
  const handle = slugifySeo(params.seoHandle || cleanTitle, 64);
  const targetUrl = `https://${brandDomain}/products/${handle}`;

  const metalText = attributes.metal ?? "18k gold & platinum";
  const certText = attributes.certification
    ? `${attributes.certification}-certified`
    : "independently certified";
  const originText =
    attributes.origin === "Lab-Grown"
      ? "ethically grown lab diamond"
      : attributes.origin === "Natural"
        ? "rare natural earth-mined diamond"
        : "hand-selected diamond";
  const piecePhrase = [attributes.carat, attributes.shape, attributes.setting, attributes.category]
    .filter(Boolean)
    .join(" ");
  const displayPiece = piecePhrase || cleanTitle;

  // Quiet-luxury, non-irritating copy — zero loud discount spam or pushy urgency.
  const metaAngleAspiration = `Designed to be felt before it is noticed. The ${cleanTitle} pairs ${originText} brilliance with refined ${metalText} proportions — crafted to become an heirloom at ${brandName}. Explore daylight details at ${brandDomain}.`;

  const metaAngleTransparency = `Every facet selected for fire and eye-clean clarity. Our ${displayPiece} is crafted in ${metalText} with ${certText} precision and direct-from-atelier transparency — no retail markup, just honest craftsmanship at ${brandName}.`;

  const metaAngleZeroRisk = `Choosing fine jewelry online should feel calm and certain. Every ${brandName} piece includes complimentary first resizing, 30-day hassle-free returns, discreet insured delivery, and a lifetime manufacturing warranty. View the ${cleanTitle} at ${brandDomain}.`;

  const metaHeadline = clampLength(`${cleanTitle} | ${brandName}`, 40);
  const metaDescription = clampLength(
    `${metalText} · ${certText} · Free Resizing & Insured Delivery`,
    90,
  );
  const recommendedCta = "Learn More";

  const hashtagSet = new Set<string>([
    `#${slugifySeo(brandName, 24).replace(/-/g, "")}`,
    "#finejewelry",
    "#diamondjewelry",
    "#quietluxury",
  ]);
  if (attributes.shape)
    hashtagSet.add(`#${attributes.shape.toLowerCase().replace(/\s+/g, "")}diamond`);
  if (attributes.setting)
    hashtagSet.add(`#${attributes.setting.toLowerCase().replace(/[^a-z0-9]/g, "")}ring`);
  if (attributes.origin === "Lab-Grown") hashtagSet.add("#labgrowndiamond");
  if (attributes.origin === "Natural") hashtagSet.add("#naturaldiamond");
  if (attributes.category.toLowerCase().includes("engagement")) hashtagSet.add("#engagementring");
  if (attributes.metal?.toLowerCase().includes("18k")) hashtagSet.add("#18kgold");
  if (attributes.metal?.toLowerCase().includes("platinum")) hashtagSet.add("#platinumjewelry");

  const hashtags = Array.from(hashtagSet).slice(0, 10).join(" ");
  const instagramCaption = `${cleanTitle}.\n\nCrafted in ${metalText} with ${certText} brilliance — made for moments meant to last.\n\n• Complimentary first resizing\n• Discreet insured shipping\n• 30-day returns & lifetime warranty\n\nTap the link or message us privately for a daylight video and sizing guidance.\n${targetUrl}\n\n${hashtags}`;

  const { exact, phrase } = buildKeywordsForProduct(cleanTitle, attributes);

  const googleRsaHeadlines = [
    clampLength(cleanTitle, 30),
    clampLength(`${brandName} Fine Jewelry`, 30),
    clampLength(`${attributes.certification ?? "Certified"} Diamond Craft`, 30),
    clampLength(`Crafted in ${metalText}`, 30),
    "Free Resizing & Returns",
    "Insured Discreet Delivery",
  ];

  const googleRsaDescriptions = [
    clampLength(
      `Explore the ${cleanTitle} at ${brandName}. ${certText} stone in ${metalText}.`,
      90,
    ),
    clampLength(
      `Direct luxury craftsmanship with 30-day returns, free resizing & lifetime warranty.`,
      90,
    ),
    clampLength(
      `Request a private gemologist consultation or daylight video on ${brandDomain}.`,
      90,
    ),
  ];

  return {
    folder: params.folder,
    handle,
    cleanTitle,
    targetUrl,
    attributes,
    primaryImageFile: params.primaryImageFile,
    metaFeedCreative: params.metaFeedCreative,
    storyCreative: params.storyCreative,
    metaAngleAspiration,
    metaAngleTransparency,
    metaAngleZeroRisk,
    metaHeadline,
    metaDescription,
    recommendedCta,
    instagramCaption,
    hashtags,
    googleKeywordsExact: exact,
    googleKeywordsPhrase: phrase,
    googleRsaHeadlines,
    googleRsaDescriptions,
  };
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildMetaAdsCsv(records: ProductAdKitRecord[]): string {
  const headers = [
    "Product",
    "Handle",
    "Recommended CTA",
    "Meta Feed Creative (4:5)",
    "Story / WhatsApp Creative (9:16)",
    "Google Shopping Clean Image (No Text)",
    "Headline (<=40)",
    "Link Description",
    "Ad Copy 1 - Quiet Luxury (TOF)",
    "Ad Copy 2 - 4Cs & Craft Transparency (MOF)",
    "Ad Copy 3 - Zero-Risk Confidence (BOF Retargeting)",
    "Instagram / Pinterest Caption",
    "Target URL",
  ];

  const rows = records.map((record) =>
    [
      record.cleanTitle,
      record.handle,
      record.recommendedCta,
      record.metaFeedCreative,
      record.storyCreative,
      record.primaryImageFile,
      record.metaHeadline,
      record.metaDescription,
      record.metaAngleAspiration,
      record.metaAngleTransparency,
      record.metaAngleZeroRisk,
      record.instagramCaption,
      record.targetUrl,
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  return `\uFEFF${[headers.map(escapeCsvCell).join(","), ...rows].join("\r\n")}\r\n`;
}

export function buildGoogleAdsCsv(records: ProductAdKitRecord[]): string {
  const headers = [
    "Product",
    "Target URL",
    "Exact Match Keywords",
    "Phrase Match Keywords",
    "RSA Headline 1 (<=30)",
    "RSA Headline 2 (<=30)",
    "RSA Headline 3 (<=30)",
    "RSA Headline 4 (<=30)",
    "RSA Description 1 (<=90)",
    "RSA Description 2 (<=90)",
    "RSA Description 3 (<=90)",
  ];

  const rows = records.map((record) =>
    [
      record.cleanTitle,
      record.targetUrl,
      record.googleKeywordsExact.join(" | "),
      record.googleKeywordsPhrase.join(" | "),
      record.googleRsaHeadlines[0] ?? "",
      record.googleRsaHeadlines[1] ?? "",
      record.googleRsaHeadlines[2] ?? "",
      record.googleRsaHeadlines[3] ?? "",
      record.googleRsaDescriptions[0] ?? "",
      record.googleRsaDescriptions[1] ?? "",
      record.googleRsaDescriptions[2] ?? "",
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  return `\uFEFF${[headers.map(escapeCsvCell).join(","), ...rows].join("\r\n")}\r\n`;
}

export function buildNegativeKeywordsText(): string {
  return [
    "# GOOGLE ADS NEGATIVE KEYWORDS — UPLOAD BEFORE SPENDING ₹1 / $1",
    "# Protects your luxury fine jewelry budget from non-buyers & low-budget clicks.",
    "# Paste directly into Google Ads -> Tools -> Negative Keyword Lists.",
    "",
    "# --- Low-Cost / Imitation / Costume ---",
    "fake",
    "fake diamond",
    "cubic zirconia",
    "cz",
    "rhinestone",
    "rhinestones",
    "costume",
    "costume jewelry",
    "artificial",
    "imitation",
    "plastic",
    "glass",
    "crystal cheap",
    "cheap",
    "cheapest",
    "under 20",
    "under 50",
    "under 100",
    "dollar store",
    "temu",
    "shein",
    "aliexpress",
    "",
    "# --- Pawn / Used / Scrap / Liquidation ---",
    "pawn",
    "pawn shop",
    "used",
    "second hand",
    "pre owned cheap",
    "scrap",
    "scrap gold",
    "sell my ring",
    "cash for gold",
    "liquidation",
    "clearance cheap",
    "wholesale cheap",
    "",
    "# --- DIY / Free / Jobs / Non-Commercial ---",
    "free",
    "diy",
    "how to make",
    "how to cut",
    "diamond cutter tools",
    "free certificate",
    "drawing",
    "clipart",
    "wallpaper",
    "png transparent",
    "jobs",
    "salary",
    "course",
    "minecraft",
    "roblox",
    "",
  ].join("\r\n");
}

export function buildWhatsappConciergeScripts(brand: BrandSeoConfig): string {
  const brandName = normalizeBrandName(brand.brandName);
  const brandDomain = normalizeBrandDomain(brand.brandDomain);

  return [
    `====================================================================`,
    `${brandName.toUpperCase()} — QUIET-LUXURY WHATSAPP & DM CONCIERGE SCRIPTS`,
    `Store: https://${brandDomain}`,
    `====================================================================`,
    ``,
    `GOLDEN RULE FOR LUXURY JEWELRY:`,
    `High-ticket buyers decide over 3 to 12 weeks. Never push or spam.`,
    `Be calm, helpful, and transparent — trust closes 3x more than urgency.`,
    ``,
    `--------------------------------------------------------------------`,
    `1. WHEN A CUSTOMER ASKS "PRICE?" (NEVER reply with just a number!)`,
    `--------------------------------------------------------------------`,
    `Hello! Thank you for reaching out to ${brandName}.`,
    `The [Product Name] is [Price], crafted in [14k/18k Gold / Platinum] with a certified diamond.`,
    ``,
    `Every order includes:`,
    `• Certified stone documentation (GIA / IGI)`,
    `• Complimentary first ring resizing`,
    `• Insured, discreet delivery & 30-day returns`,
    `• Lifetime manufacturing warranty`,
    ``,
    `Would you like me to share a quick natural-daylight view or check your preferred carat & metal option?`,
    ``,
    `--------------------------------------------------------------------`,
    `2. WHEN THEY SAY "I NEED TIME TO THINK" (Zero Pressure!)`,
    `--------------------------------------------------------------------`,
    `Completely understand — fine jewelry is a meaningful decision and worth taking your time with.`,
    `Whenever you'd like to compare diamond shapes, carat sizes on hand, or metal tones, I'm right here.`,
    `I'll leave the details at https://${brandDomain} for you whenever you're ready.`,
    ``,
    `--------------------------------------------------------------------`,
    `3. GENTLE DAY-4 VALUE FOLLOW-UP (Only once — never spam!)`,
    `--------------------------------------------------------------------`,
    `Hi [Name], hope you're having a lovely week! Just checking in case you had any questions about ring sizing, diamond clarity (VS1 vs VVS2), or metal choice for the [Product Name]. Happy to help anytime — no rush at all.`,
    ``,
    `--------------------------------------------------------------------`,
    `4. TRUST & ONLINE BUYING HESITATION REPLY`,
    `--------------------------------------------------------------------`,
    `It's completely natural to want certainty before ordering fine jewelry online.`,
    `With ${brandName}, your stone comes with independent certification, insured delivery right to your door, 30-day hassle-free returns, and free first resizing — so there is zero risk if you want to inspect it in person first.`,
    ``,
    `--------------------------------------------------------------------`,
    `5. POST-PURCHASE VIP CARE & REPEAT-BUYER TIMELINE`,
    `--------------------------------------------------------------------`,
    `• Day 14 (Care Check-In): "Hope you're loving your ${brandName} piece! Here's a quick tip to keep its brilliance sparkling: warm water, a drop of mild dish soap, and a soft brush once a week."`,
    `• Day 45 (Matching Band): "Whenever you're thinking about a matching wedding or stacking band, we'd love to custom-match the exact metal tone & profile for you with VIP client pricing."`,
    `• Month 11 (Anniversary): "Wishing you an early happy anniversary! If you're looking for timeless diamond studs or an eternity band, we're happy to curate 3 private options for you."`,
    ``,
  ].join("\r\n");
}

export function buildAdLaunchPlaybook(brand: BrandSeoConfig, productCount: number): string {
  const brandName = normalizeBrandName(brand.brandName);
  const brandDomain = normalizeBrandDomain(brand.brandDomain);

  return [
    `# ${brandName} — Quiet-Luxury Ad & Conversion Launch Playbook`,
    ``,
    `Prepared locally for **${brandName}** (\`https://${brandDomain}\`) · **${productCount}** product${productCount === 1 ? "" : "s"} exported.`,
    ``,
    `---`,
    ``,
    `## 1. Which File Goes Where? (Do Not Mix!)`,
    ``,
    `| Channel | Use These Files | Why |`,
    `| --- | --- | --- |`,
    `| **Website & Google Shopping (Merchant Center)** | \`<product>/images/*.webp\` | 100% pure, fast WebP, zero metadata, zero text/watermark (Google Shopping requires clean photos!) |`,
    `| **Meta / Instagram / Pinterest Feed Ads** | \`<product>/ad-creatives/*-meta-feed-4x5.webp\` | Calm museum-grade 4:5 vertical framing (\`1080×1350\`) with subtle brand header & silent trust pillars — takes max mobile screen space without irritating buyers |`,
    `| **Instagram Stories / WhatsApp Status / VIP DM** | \`<product>/ad-creatives/*-story-9x16.webp\` | Full-screen \`9:16\` editorial lookbook card (\`1080×1920\`) respecting UI safe zones |`,
    `| **Shopify / WooCommerce SEO Import** | \`seo-kit/seo-import.csv\` & \`product-schemas.json\` | Clean SEO Titles, Meta Descriptions, unique per-angle Alt texts & Google Product JSON-LD Rich Snippets |`,
    `| **Meta Ads Copy & IG Captions** | \`ad-growth-kit/meta-instagram-ads.csv\` | 3 tested quiet-luxury angles (Aspiration, 4Cs Transparency, Zero-Risk Retargeting) |`,
    `| **Google Search Ads** | \`ad-growth-kit/google-ads-keywords.csv\` + \`google-ads-negative-keywords.txt\` | Exact & Phrase high-intent keywords + negative list to block wasted clicks |`,
    `| **WhatsApp / DM Sales Replies** | \`ad-growth-kit/whatsapp-vip-concierge-scripts.txt\` | Calm, zero-pressure VIP responses that convert high-ticket buyers |`,
    ``,
    `---`,
    ``,
    `## 2. Why Customers Buy Without Feeling Irritated (Quiet-Luxury Rules)`,
    ``,
    `1. **Use \`Learn More\` CTA on Cold Ads (NOT \`Buy Now\`)**: Fine jewelry takes 3–12 weeks to decide. \`Learn More\` gets lower CPC and higher quality clicks than pushy \`Buy Now\` buttons.`,
    `2. **Never Use Loud Red Discount Stickers**: Loud "50% OFF!!" graphics destroy diamond trust. Let clean visuals, certification (GIA/IGI), and silent risk-reversal (30-Day Returns, Free Resizing, Insured Delivery, Lifetime Warranty) do the selling.`,
    `3. **Upload \`google-ads-negative-keywords.txt\` FIRST**: Before activating any Google Search campaign, attach the negative keyword list — this single step prevents 40–60% of budget waste on "cheap / fake / pawn / cz" searches.`,
    `4. **Test 3 Angles on Small Budget**: Run the 3 Meta copy angles from \`meta-instagram-ads.csv\` against the \`4:5\` editorial creative. Keep the winner after 3–5 days, pause the rest.`,
    `5. **Reply Within 5 Minutes on WhatsApp**: High-ticket buyers message 2–3 jewelers. Fast, calm, helpful replies using \`whatsapp-vip-concierge-scripts.txt\` win the order even against huge brands.`,
    ``,
    `---`,
    ``,
    `## 3. Compliance Reminder`,
    ``,
    `Always ensure you hold supplier/reseller rights or own the photography published on \`https://${brandDomain}\` so your ad accounts and SEO rankings stay permanently protected.`,
    ``,
  ].join("\r\n");
}
