import type JSZip from "jszip";

import {
  buildAdLaunchPlaybook,
  buildGoogleAdsCsv,
  buildMetaAdsCsv,
  buildNegativeKeywordsText,
  buildProductAdKitRecord,
  buildWhatsappConciergeScripts,
  detectJewelryAttributes,
  formatCreativeSubline,
  type ProductAdKitRecord,
} from "@/lib/ad-growth-kit";
import {
  renderLuxuryAdCreative,
  sanitizeImageBytes,
  type ImageFrameMode,
  type ImageOutputFormat,
  type ImageTransformOptions,
} from "@/lib/image-forensics";
import {
  buildProductSeoRecord,
  buildSeoKitCsv,
  DEFAULT_BRAND_SEO,
  normalizeBrandDomain,
  normalizeBrandName,
  slugifySeo,
  stripSourceBrandText,
  type ProductSeoRecord,
} from "@/lib/seo-kit";

const envDefaultStore =
  typeof import.meta !== "undefined" && import.meta.env?.["VITE_DEFAULT_STORE_URL"]
    ? String(import.meta.env["VITE_DEFAULT_STORE_URL"]).trim()
    : "";

export const DEFAULT_STORE_URL = envDefaultStore || "https://stienhardt.com";
export const SHOPIFY_PAGE_SIZE = 24;
const SHOPIFY_COLLECTIONS_PAGE_SIZE = 250;
const MAX_COLLECTIONS_PAGES = 20;
const ASSET_DOWNLOAD_CONCURRENCY = 4;

export type ShopifyCollection = {
  id: number;
  title: string;
  handle: string;
  products_count: number;
  image: { src: string; alt?: string | null } | null;
};

export type ShopifyProductSummary = {
  id: number;
  title: string;
  handle: string;
  product_type?: string;
  vendor?: string;
  images: Array<{ src: string; alt?: string | null }>;
};

export type ShopifyVideoSource = {
  format?: string;
  height?: number;
  width?: number;
  mime_type?: string;
  url: string;
};

export type ShopifyMedia = {
  id: number;
  alt?: string | null;
  media_type: string;
  src?: string;
  width?: number;
  height?: number;
  preview_image?: { src: string };
  sources?: ShopifyVideoSource[];
};

export type ShopifyProductDetail = Omit<ShopifyProductSummary, "images"> & {
  type?: string;
  description?: string;
  price?: number;
  images?: Array<string | { src: string; alt?: string | null }>;
  media?: ShopifyMedia[];
};

export type ProductAsset = {
  url: string;
  path: string;
  label: string;
  kind: "image" | "video";
};

export type ExportProgress = {
  product: number;
  productCount: number;
  asset: number;
  assetCount: number;
  label: string;
};

export type ArchiveFilenameMode = "original" | "neutral" | "seo";

export type ArchiveCleanOptions = {
  stripImageMetadata: boolean;
  cleanFilenames: boolean;
  removeSourceFootprint: boolean;
  outputFormat?: ImageOutputFormat | undefined;
  maxDimension?: number | undefined;
  frameMode?: ImageFrameMode | undefined;
  filenameMode?: ArchiveFilenameMode | undefined;
  includeSeoKit?: boolean | undefined;
  includeAdGrowthKit?: boolean | undefined;
  brandName?: string | undefined;
  brandDomain?: string | undefined;
};

export const FULL_CLEAN_OPTIONS: ArchiveCleanOptions = {
  stripImageMetadata: true,
  cleanFilenames: true,
  removeSourceFootprint: true,
};

export const DEFAULT_SEO_CLEAN_OPTIONS: ArchiveCleanOptions = {
  stripImageMetadata: true,
  cleanFilenames: true,
  removeSourceFootprint: true,
  outputFormat: "webp",
  maxDimension: 1600,
  frameMode: "original",
  filenameMode: "seo",
  includeSeoKit: true,
  includeAdGrowthKit: true,
  brandName: DEFAULT_BRAND_SEO.brandName,
  brandDomain: DEFAULT_BRAND_SEO.brandDomain,
};

export const NO_CLEAN_OPTIONS: ArchiveCleanOptions = {
  stripImageMetadata: false,
  cleanFilenames: false,
  removeSourceFootprint: false,
  outputFormat: "original",
  maxDimension: 0,
  frameMode: "original",
  filenameMode: "original",
  includeSeoKit: false,
  includeAdGrowthKit: false,
  brandName: DEFAULT_BRAND_SEO.brandName,
  brandDomain: DEFAULT_BRAND_SEO.brandDomain,
};

export const NEUTRAL_ZIP_DATE = new Date(Date.UTC(2000, 0, 1, 0, 0, 0));

export type ExportResult = {
  files: number;
  skipped: number;
  products: number;
  cleanedImages?: number;
  seoKitIncluded?: boolean;
  adKitIncluded?: boolean;
  adCreativesCreated?: number;
};

export function resolveFilenameMode(options?: Partial<ArchiveCleanOptions>): ArchiveFilenameMode {
  if (options?.filenameMode) return options.filenameMode;
  return options?.cleanFilenames ? "neutral" : "original";
}

export function getArchiveDownloadFilename(
  collectionHandle: string,
  options?: Partial<ArchiveCleanOptions>,
): string {
  const mode = resolveFilenameMode(options);
  if (mode === "seo") {
    const brandSlug = slugifySeo(normalizeBrandName(options?.brandName ?? ""), 32);
    return `${brandSlug}-seo-export.zip`;
  }
  if (mode === "neutral") {
    return "studio-export-clean.zip";
  }
  return `${safeAssetName(collectionHandle)}-media.zip`;
}

const LEGACY_SHOPIFY_SIZE_SUFFIX =
  /(?:_(?:pico|icon|thumb|small|compact|medium|large|grande|master|\d+x\d*|x\d+)(?:_crop_(?:top|center|bottom|left|right))?(?:@[23]x)?)(?=\.[a-zA-Z0-9]{2,5}$)/i;

function normalizeStoreUrl(value: string): URL {
  const candidate = value.trim();
  if (!candidate) {
    throw new Error("Enter a valid Shopify storefront address.");
  }
  let parsed: URL;
  try {
    parsed = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
  } catch {
    throw new Error("Enter a valid Shopify storefront address.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Enter a valid Shopify storefront address.");
  }
  if (parsed.username || parsed.password || !parsed.hostname.includes(".")) {
    throw new Error("Enter a valid Shopify storefront address.");
  }
  parsed.protocol = "https:";
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed;
}

export function getStoreOrigin(value: string): string {
  return normalizeStoreUrl(value).origin;
}

export function normalizeMediaUrl(value: string, storeOrigin?: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (storeOrigin && trimmed.startsWith("/")) {
    return new URL(trimmed, storeOrigin).toString();
  }
  return trimmed;
}

export function getHighResolutionImageUrl(value: string, storeOrigin?: string): string {
  const normalized = normalizeMediaUrl(value, storeOrigin);
  if (!normalized) return "";
  try {
    const url = new URL(normalized, storeOrigin);
    ["width", "height", "crop", "pad_color", "scale", "quality"].forEach((key) =>
      url.searchParams.delete(key),
    );
    url.pathname = url.pathname.replace(LEGACY_SHOPIFY_SIZE_SUFFIX, "");
    return url.toString();
  } catch {
    return normalized;
  }
}

export function getBestMp4Source(
  sources: ShopifyVideoSource[],
  storeOrigin?: string,
): ShopifyVideoSource | undefined {
  const best = sources
    .filter((source) => Boolean(source.url))
    .filter(
      (source) =>
        source.format?.toLowerCase() === "mp4" || source.mime_type?.toLowerCase() === "video/mp4",
    )
    .sort((a, b) => {
      const heightDiff = (b.height ?? 0) - (a.height ?? 0);
      if (heightDiff !== 0) return heightDiff;
      return (b.width ?? 0) - (a.width ?? 0);
    })[0];

  if (!best) return undefined;
  return {
    ...best,
    url: normalizeMediaUrl(best.url, storeOrigin),
  };
}

export function safeAssetName(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "asset"
  );
}

function extensionFor(url: string, contentType?: string): string {
  const normalizedType = contentType?.toLowerCase() ?? "";
  if (normalizedType.includes("image/webp")) return "webp";
  if (normalizedType.includes("image/png")) return "png";
  if (normalizedType.includes("image/jpeg") || normalizedType.includes("image/jpg")) return "jpg";
  if (normalizedType.includes("image/avif")) return "avif";
  if (normalizedType.includes("image/gif")) return "gif";
  if (normalizedType.includes("image/svg")) return "svg";
  if (normalizedType.includes("video/mp4")) return "mp4";
  if (normalizedType.includes("video/webm")) return "webm";
  if (normalizedType.includes("video/quicktime")) return "mov";

  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (match?.[1]) return match[1].toLowerCase();
  } catch {
    // Fall back to default extension below.
  }
  return "jpg";
}

function createAbortError(): Error {
  const error = new Error("Export cancelled.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

async function readProxyJson<T>(
  params: Record<string, string | number>,
  signal?: AbortSignal,
): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    query.set(key, String(value));
  }
  const response = await fetch(`/api/shopify?${query.toString()}`, {
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    let message = `The store returned ${response.status}. Check the address and try again.`;
    try {
      const payload = (await response.json()) as { error?: unknown };
      if (typeof payload.error === "string" && payload.error.trim()) {
        message = payload.error;
      }
    } catch {
      // Keep default status message when error body is not JSON.
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export async function fetchCollections(
  store: string,
  signal?: AbortSignal,
): Promise<ShopifyCollection[]> {
  const origin = getStoreOrigin(store);
  const allCollections: ShopifyCollection[] = [];
  const seenIds = new Set<number>();

  for (let page = 1; page <= MAX_COLLECTIONS_PAGES; page += 1) {
    throwIfAborted(signal);
    const data = await readProxyJson<{ collections?: ShopifyCollection[] }>(
      {
        store: origin,
        type: "collections",
        limit: SHOPIFY_COLLECTIONS_PAGE_SIZE,
        page,
      },
      signal,
    );
    const batch = data.collections ?? [];
    for (const collection of batch) {
      if (!seenIds.has(collection.id)) {
        seenIds.add(collection.id);
        allCollections.push(collection);
      }
    }
    if (batch.length < SHOPIFY_COLLECTIONS_PAGE_SIZE) break;
  }

  return allCollections;
}

export async function fetchCollectionProducts(
  store: string,
  handle: string,
  page: number,
  signal?: AbortSignal,
): Promise<ShopifyProductSummary[]> {
  const origin = getStoreOrigin(store);
  const data = await readProxyJson<{ products?: ShopifyProductSummary[] }>(
    {
      store: origin,
      type: "products",
      handle,
      limit: SHOPIFY_PAGE_SIZE,
      page,
    },
    signal,
  );
  return data.products ?? [];
}

export async function fetchProductDetail(
  store: string,
  handle: string,
  signal?: AbortSignal,
): Promise<ShopifyProductDetail> {
  const origin = getStoreOrigin(store);
  return readProxyJson<ShopifyProductDetail>(
    {
      store: origin,
      type: "product",
      handle,
    },
    signal,
  );
}

export function getProductAssets(
  detail: ShopifyProductDetail,
  store: string,
  cleanFilenames: boolean | { mode: ArchiveFilenameMode; seoPrefix?: string } = false,
): ProductAsset[] {
  const origin = getStoreOrigin(store);
  const imageUrls = new Set<string>();
  const videoUrls = new Set<string>();
  const videos: Array<{ url: string; height: number }> = [];

  for (const media of detail.media ?? []) {
    if (media.media_type === "image" && media.src) {
      const highRes = getHighResolutionImageUrl(media.src, origin);
      if (highRes) imageUrls.add(highRes);
    }
    if (media.media_type === "video") {
      const best = getBestMp4Source(media.sources ?? [], origin);
      if (best?.url && !videoUrls.has(best.url)) {
        videoUrls.add(best.url);
        videos.push({ url: best.url, height: best.height ?? 0 });
      }
    }
  }

  if (imageUrls.size === 0) {
    for (const image of detail.images ?? []) {
      const rawSrc = typeof image === "string" ? image : image?.src;
      if (rawSrc) {
        const highRes = getHighResolutionImageUrl(rawSrc, origin);
        if (highRes) imageUrls.add(highRes);
      }
    }
  }

  const mode: ArchiveFilenameMode =
    typeof cleanFilenames === "boolean"
      ? cleanFilenames
        ? "neutral"
        : "original"
      : cleanFilenames.mode;
  const seoPrefix =
    typeof cleanFilenames === "object" && cleanFilenames.seoPrefix
      ? cleanFilenames.seoPrefix
      : safeAssetName(detail.handle);
  const slug = safeAssetName(detail.handle);

  const imageAssets: ProductAsset[] = Array.from(imageUrls).map((url, index) => {
    const seq = String(index + 1).padStart(2, "0");
    const ext = extensionFor(url);
    const path =
      mode === "seo"
        ? `images/${seoPrefix}-${seq}.${ext}`
        : mode === "neutral"
          ? `images/image-${seq}.${ext}`
          : `images/${seq}-${slug}.${ext}`;
    return {
      url,
      path,
      label: `Image ${index + 1}`,
      kind: "image",
    };
  });
  const videoAssets: ProductAsset[] = videos.map((video, index) => {
    const seq = String(index + 1).padStart(2, "0");
    const path =
      mode === "seo"
        ? `videos/${seoPrefix}-${seq}.mp4`
        : mode === "neutral"
          ? `videos/video-${seq}.mp4`
          : `videos/${seq}-${slug}${video.height > 0 ? `-${video.height}p` : ""}.mp4`;
    return {
      url: video.url,
      path,
      label: video.height > 0 ? `Video ${index + 1} · ${video.height}p` : `Video ${index + 1}`,
      kind: "video",
    };
  });
  return [...imageAssets, ...videoAssets];
}

async function fetchMediaBytes(
  url: string,
  signal?: AbortSignal,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  throwIfAborted(signal);
  try {
    const direct = await fetch(url, signal ? { signal } : undefined);
    if (direct.ok) {
      return {
        bytes: new Uint8Array(await direct.arrayBuffer()),
        contentType: direct.headers.get("content-type") ?? "",
      };
    }
  } catch (cause) {
    if (signal?.aborted || (cause instanceof Error && cause.name === "AbortError")) {
      throw createAbortError();
    }
    // Fall back to same-origin streaming proxy when CORS blocks direct browser access.
  }

  throwIfAborted(signal);
  const proxied = await fetch(
    `/api/media?url=${encodeURIComponent(url)}`,
    signal ? { signal } : undefined,
  );
  if (!proxied.ok) {
    throw new Error(`File returned ${proxied.status}`);
  }
  return {
    bytes: new Uint8Array(await proxied.arrayBuffer()),
    contentType: proxied.headers.get("content-type") ?? "",
  };
}

function replacePathExtension(filePath: string, extension: string): string {
  if (/\.[^./]+$/.test(filePath)) {
    return filePath.replace(/\.[^./]+$/, `.${extension}`);
  }
  return `${filePath}.${extension}`;
}

async function addRemoteFile(
  zip: JSZip,
  url: string,
  targetPath: string,
  options: {
    kind: "image" | "video";
    stripImageMetadata: boolean;
    imageTransform?: ImageTransformOptions | undefined;
    neutralizeDate: boolean;
    returnBytes?: boolean;
    signal?: AbortSignal | undefined;
  },
): Promise<{ path: string; cleaned: boolean; bytes?: Uint8Array; contentType?: string }> {
  const { bytes, contentType } = await fetchMediaBytes(url, options.signal);
  throwIfAborted(options.signal);

  let finalBytes: Uint8Array = bytes;
  let finalContentType = contentType;
  let cleaned = false;

  const hasTransform =
    options.imageTransform &&
    ((options.imageTransform.outputFormat && options.imageTransform.outputFormat !== "original") ||
      (options.imageTransform.maxDimension && options.imageTransform.maxDimension > 0) ||
      (options.imageTransform.frameMode && options.imageTransform.frameMode !== "original"));

  if (options.kind === "image" && (options.stripImageMetadata || hasTransform)) {
    const sanitized = await sanitizeImageBytes(bytes, contentType, options.imageTransform);
    throwIfAborted(options.signal);
    finalBytes = sanitized.bytes;
    finalContentType = sanitized.mimeType;
    cleaned = true;
  }

  const resolvedPath = replacePathExtension(targetPath, extensionFor(url, finalContentType));
  zip.file(
    resolvedPath,
    finalBytes,
    options.neutralizeDate ? { date: NEUTRAL_ZIP_DATE } : undefined,
  );
  return options.returnBytes
    ? { path: resolvedPath, cleaned, bytes: finalBytes, contentType: finalContentType }
    : { path: resolvedPath, cleaned };
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      throwIfAborted(signal);
      const current = cursor;
      cursor += 1;
      const item = items.at(current);
      if (item !== undefined) {
        await worker(item, current);
      }
    }
  });
  await Promise.all(workers);
}

export async function createProductsArchive(
  store: string,
  collection: ShopifyCollection,
  products: ShopifyProductSummary[],
  onProgress: (progress: ExportProgress) => void,
  signal?: AbortSignal,
  cleanOptions?: Partial<ArchiveCleanOptions>,
): Promise<{ blob: Blob; result: ExportResult }> {
  const filenameMode = resolveFilenameMode(cleanOptions);
  const brandName = normalizeBrandName(cleanOptions?.brandName ?? "");
  const brandDomain = normalizeBrandDomain(cleanOptions?.brandDomain ?? "");
  const brandSlug = slugifySeo(brandName, 28);
  const includeSeoKit = Boolean(cleanOptions?.includeSeoKit);
  const includeAdGrowthKit = Boolean(cleanOptions?.includeAdGrowthKit);
  const imageTransform: ImageTransformOptions | undefined =
    cleanOptions?.outputFormat || cleanOptions?.maxDimension || cleanOptions?.frameMode
      ? {
          outputFormat: cleanOptions.outputFormat ?? "original",
          maxDimension: cleanOptions.maxDimension ?? 0,
          frameMode: cleanOptions.frameMode ?? "original",
        }
      : undefined;

  const clean: ArchiveCleanOptions = {
    stripImageMetadata: Boolean(cleanOptions?.stripImageMetadata),
    cleanFilenames: filenameMode !== "original",
    removeSourceFootprint: Boolean(cleanOptions?.removeSourceFootprint),
    outputFormat: imageTransform?.outputFormat,
    maxDimension: imageTransform?.maxDimension,
    frameMode: imageTransform?.frameMode,
    filenameMode,
    includeSeoKit,
    includeAdGrowthKit,
    brandName,
    brandDomain,
  };

  const origin = getStoreOrigin(store);
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const collectionFolder =
    filenameMode === "seo"
      ? brandSlug
      : filenameMode === "neutral"
        ? "clean-media"
        : safeAssetName(collection.handle);
  let completedFiles = 0;
  let skippedFiles = 0;
  let cleanedImages = 0;
  let adCreativesCreated = 0;
  const seoRecords: ProductSeoRecord[] = [];
  const adKitRecords: ProductAdKitRecord[] = [];

  const uniqueProducts: ShopifyProductSummary[] = [];
  const seenHandles = new Set<string>();
  for (const product of products) {
    if (!seenHandles.has(product.handle)) {
      seenHandles.add(product.handle);
      uniqueProducts.push(product);
    }
  }

  const folderPadWidth = Math.max(2, String(uniqueProducts.length).length);
  const usedFolderNames = new Set<string>();
  const reserveUniqueSlug = (base: string): string => {
    let candidate = base || "item";
    let suffix = 2;
    while (usedFolderNames.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    usedFolderNames.add(candidate);
    return candidate;
  };

  for (let productIndex = 0; productIndex < uniqueProducts.length; productIndex += 1) {
    throwIfAborted(signal);
    const summary = uniqueProducts.at(productIndex);
    if (!summary) continue;

    onProgress({
      product: productIndex + 1,
      productCount: uniqueProducts.length,
      asset: 0,
      assetCount: 0,
      label: clean.stripImageMetadata ? `Cleaning ${summary.title}` : summary.title,
    });

    try {
      const detail = await fetchProductDetail(origin, summary.handle, signal);
      const sourceVendor = detail.vendor ?? summary.vendor ?? null;
      const cleanSeoTitle = stripSourceBrandText(detail.title, sourceVendor, origin);
      const seoBaseHandle = slugifySeo(cleanSeoTitle, 52);

      let productFolder: string;
      let folderRelativeName: string;
      let seoHandle: string;

      if (filenameMode === "seo") {
        seoHandle = reserveUniqueSlug(seoBaseHandle);
        folderRelativeName = seoHandle;
        productFolder = `${collectionFolder}/${seoHandle}`;
      } else if (filenameMode === "neutral") {
        const seq = String(productIndex + 1).padStart(folderPadWidth, "0");
        seoHandle = seoBaseHandle;
        folderRelativeName = `item-${seq}`;
        productFolder = `${collectionFolder}/${folderRelativeName}`;
      } else {
        const uniqueOriginal = reserveUniqueSlug(safeAssetName(summary.handle));
        seoHandle = seoBaseHandle;
        folderRelativeName = `products/${uniqueOriginal}`;
        productFolder = `${collectionFolder}/${folderRelativeName}`;
      }

      const seoFilePrefix = slugifySeo(`${brandSlug}-${seoHandle}`, 60);
      const assets = getProductAssets(detail, origin, {
        mode: filenameMode,
        seoPrefix: seoFilePrefix,
      });
      const recordedMedia: Array<{
        path: string;
        url: string;
        label: string;
        kind: "image" | "video";
        downloaded: boolean;
      }> = new Array(assets.length);

      let primaryImageSample: { bytes: Uint8Array; contentType: string; path: string } | null =
        null;
      let processedAssets = 0;
      await runWithConcurrency(
        assets,
        ASSET_DOWNLOAD_CONCURRENCY,
        async (asset, assetIndex) => {
          try {
            const capturePrimary = includeAdGrowthKit && asset.kind === "image" && assetIndex === 0;
            const saved = await addRemoteFile(zip, asset.url, `${productFolder}/${asset.path}`, {
              kind: asset.kind,
              stripImageMetadata: clean.stripImageMetadata,
              imageTransform,
              neutralizeDate: clean.removeSourceFootprint,
              returnBytes: capturePrimary,
              signal,
            });
            const savedRelativePath = saved.path.startsWith(`${productFolder}/`)
              ? saved.path.slice(productFolder.length + 1)
              : asset.path;
            if (capturePrimary && saved.bytes) {
              primaryImageSample = {
                bytes: saved.bytes,
                contentType: saved.contentType ?? "image/jpeg",
                path: `${folderRelativeName}/${savedRelativePath}`,
              };
            }
            recordedMedia[assetIndex] = {
              path: savedRelativePath,
              url: asset.url,
              label: asset.label,
              kind: asset.kind,
              downloaded: true,
            };
            completedFiles += 1;
            if (saved.cleaned) cleanedImages += 1;
          } catch (cause) {
            if (signal?.aborted || (cause instanceof Error && cause.name === "AbortError")) {
              throw createAbortError();
            }
            recordedMedia[assetIndex] = {
              path: asset.path,
              url: asset.url,
              label: asset.label,
              kind: asset.kind,
              downloaded: false,
            };
            skippedFiles += 1;
          } finally {
            processedAssets += 1;
            onProgress({
              product: productIndex + 1,
              productCount: uniqueProducts.length,
              asset: processedAssets,
              assetCount: assets.length,
              label:
                clean.stripImageMetadata && asset.kind === "image"
                  ? `${summary.title} · Cleaned ${asset.label}`
                  : `${summary.title} · ${asset.label}`,
            });
          }
        },
        signal,
      );

      const downloadedImagePaths = recordedMedia
        .filter((item): item is NonNullable<typeof item> =>
          Boolean(item?.downloaded && item.kind === "image"),
        )
        .map((item) => item.path);

      if (includeSeoKit) {
        seoRecords.push(
          buildProductSeoRecord({
            rawTitle: detail.title,
            rawProductType: detail.type ?? detail.product_type ?? summary.product_type ?? null,
            sourceVendor,
            storeOrigin: origin,
            priceCents: detail.price ?? null,
            folder: folderRelativeName,
            seoHandle,
            imagePaths: downloadedImagePaths,
            brand: { brandName, brandDomain },
          }),
        );
      }

      if (includeAdGrowthKit) {
        const cleanType = detail.type ?? detail.product_type ?? summary.product_type ?? null;
        const attributes = detectJewelryAttributes(cleanSeoTitle, cleanType, detail.description);
        const creativeSubline = formatCreativeSubline(attributes);
        const zipOpts = clean.removeSourceFootprint ? { date: NEUTRAL_ZIP_DATE } : undefined;
        let metaFeedRelPath = "";
        let storyRelPath = "";

        if (primaryImageSample !== null) {
          const sample: { bytes: Uint8Array; contentType: string; path: string } =
            primaryImageSample;
          const creativeBase = filenameMode === "neutral" ? "creative" : seoFilePrefix;

          const feedCard = await renderLuxuryAdCreative(sample.bytes, sample.contentType, {
            variant: "meta-feed-4x5",
            brandName,
            brandDomain,
            productTitle: cleanSeoTitle,
            subline: creativeSubline,
            outputFormat: imageTransform?.outputFormat,
          });
          throwIfAborted(signal);
          if (feedCard) {
            const ext = extensionFor("", feedCard.mimeType);
            const rel = `ad-creatives/${creativeBase}-meta-feed-4x5.${ext}`;
            zip.file(`${productFolder}/${rel}`, feedCard.bytes, zipOpts);
            metaFeedRelPath = `${folderRelativeName}/${rel}`;
            adCreativesCreated += 1;
          }

          const storyCard = await renderLuxuryAdCreative(sample.bytes, sample.contentType, {
            variant: "story-whatsapp-9x16",
            brandName,
            brandDomain,
            productTitle: cleanSeoTitle,
            subline: creativeSubline,
            outputFormat: imageTransform?.outputFormat,
          });
          throwIfAborted(signal);
          if (storyCard) {
            const ext = extensionFor("", storyCard.mimeType);
            const rel = `ad-creatives/${creativeBase}-story-9x16.${ext}`;
            zip.file(`${productFolder}/${rel}`, storyCard.bytes, zipOpts);
            storyRelPath = `${folderRelativeName}/${rel}`;
            adCreativesCreated += 1;
          }
        }

        const primaryCleanImage = downloadedImagePaths[0]
          ? `${folderRelativeName}/${downloadedImagePaths[0]}`
          : "";
        adKitRecords.push(
          buildProductAdKitRecord({
            rawTitle: detail.title,
            rawProductType: cleanType,
            rawDescription: detail.description ?? null,
            sourceVendor,
            storeOrigin: origin,
            folder: folderRelativeName,
            seoHandle,
            primaryImageFile: primaryCleanImage,
            metaFeedCreative: metaFeedRelPath || primaryCleanImage,
            storyCreative: storyRelPath || primaryCleanImage,
            brand: { brandName, brandDomain },
          }),
        );
      }

      if (!clean.removeSourceFootprint) {
        const productRecord = {
          id: detail.id,
          title: detail.title,
          handle: detail.handle,
          vendor: sourceVendor,
          productType: detail.type ?? detail.product_type ?? summary.product_type ?? null,
          description: detail.description ?? "",
          priceCents: detail.price ?? null,
          source: `${origin}/products/${detail.handle}`,
          media: recordedMedia.filter(Boolean),
        };
        zip.file(`${productFolder}/product.json`, JSON.stringify(productRecord, null, 2));
      }

      if (assets.length === 0) skippedFiles += 1;
    } catch (cause) {
      if (signal?.aborted || (cause instanceof Error && cause.name === "AbortError")) {
        throw createAbortError();
      }
      skippedFiles += 1;
    }
  }

  throwIfAborted(signal);
  const cover = collection.image?.src;
  let coverFile: string | null = null;
  if (cover) {
    try {
      const coverTarget =
        filenameMode === "seo"
          ? `${collectionFolder}/${brandSlug}-collection-cover.jpg`
          : filenameMode === "neutral"
            ? `${collectionFolder}/cover.jpg`
            : `${collectionFolder}/collection-cover.jpg`;
      const savedCover = await addRemoteFile(
        zip,
        getHighResolutionImageUrl(cover, origin),
        coverTarget,
        {
          kind: "image",
          stripImageMetadata: clean.stripImageMetadata,
          imageTransform,
          neutralizeDate: clean.removeSourceFootprint,
          signal,
        },
      );
      coverFile = savedCover.path.slice(collectionFolder.length + 1);
      completedFiles += 1;
      if (savedCover.cleaned) cleanedImages += 1;
    } catch (cause) {
      if (signal?.aborted || (cause instanceof Error && cause.name === "AbortError")) {
        throw createAbortError();
      }
      skippedFiles += 1;
    }
  }

  if (includeSeoKit && seoRecords.length > 0) {
    const zipOpts = clean.removeSourceFootprint ? { date: NEUTRAL_ZIP_DATE } : undefined;
    zip.file(`${collectionFolder}/seo-kit/seo-import.csv`, buildSeoKitCsv(seoRecords), zipOpts);
    zip.file(
      `${collectionFolder}/seo-kit/product-schemas.json`,
      JSON.stringify(
        seoRecords.map((record) => ({
          folder: record.folder,
          handle: record.handle,
          title: record.title,
          metaTitle: record.metaTitle,
          metaDescription: record.metaDescription,
          targetUrl: record.targetUrl,
          images: record.images,
          jsonLd: record.jsonLd,
        })),
        null,
        2,
      ),
      zipOpts,
    );
  }

  if (includeAdGrowthKit && adKitRecords.length > 0) {
    const zipOpts = clean.removeSourceFootprint ? { date: NEUTRAL_ZIP_DATE } : undefined;
    const brandConfig = { brandName, brandDomain };
    zip.file(
      `${collectionFolder}/ad-growth-kit/START-HERE-AD-PLAYBOOK.md`,
      buildAdLaunchPlaybook(brandConfig, adKitRecords.length),
      zipOpts,
    );
    zip.file(
      `${collectionFolder}/ad-growth-kit/meta-instagram-ads.csv`,
      buildMetaAdsCsv(adKitRecords),
      zipOpts,
    );
    zip.file(
      `${collectionFolder}/ad-growth-kit/google-ads-keywords.csv`,
      buildGoogleAdsCsv(adKitRecords),
      zipOpts,
    );
    zip.file(
      `${collectionFolder}/ad-growth-kit/google-ads-negative-keywords.txt`,
      buildNegativeKeywordsText(),
      zipOpts,
    );
    zip.file(
      `${collectionFolder}/ad-growth-kit/whatsapp-vip-concierge-scripts.txt`,
      buildWhatsappConciergeScripts(brandConfig),
      zipOpts,
    );
  }

  if (!clean.removeSourceFootprint) {
    zip.file(
      `${collectionFolder}/manifest.json`,
      JSON.stringify(
        {
          collection: { title: collection.title, handle: collection.handle },
          store: origin,
          coverFile,
          exportedAt: new Date().toISOString(),
          products: uniqueProducts.map(({ title, handle }) => ({ title, handle })),
          filesDownloaded: completedFiles,
          filesSkipped: skippedFiles,
        },
        null,
        2,
      ),
    );
  }

  if (clean.removeSourceFootprint) {
    for (const entry of Object.values(zip.files)) {
      entry.date = NEUTRAL_ZIP_DATE;
    }
  }

  throwIfAborted(signal);
  const blob = await zip.generateAsync(
    {
      type: "blob",
      compression: "STORE",
      ...(clean.removeSourceFootprint ? { comment: "" } : {}),
    },
    (metadata) => {
      onProgress({
        product: uniqueProducts.length,
        productCount: uniqueProducts.length,
        asset: Math.round(metadata.percent),
        assetCount: 100,
        label: clean.stripImageMetadata ? "Packing cleaned SEO archive" : "Packing product folders",
      });
    },
  );
  throwIfAborted(signal);

  const result: ExportResult =
    clean.stripImageMetadata || includeSeoKit || includeAdGrowthKit
      ? {
          files: completedFiles,
          skipped: skippedFiles,
          products: uniqueProducts.length,
          ...(clean.stripImageMetadata ? { cleanedImages } : {}),
          ...(includeSeoKit ? { seoKitIncluded: seoRecords.length > 0 } : {}),
          ...(includeAdGrowthKit
            ? { adKitIncluded: adKitRecords.length > 0, adCreativesCreated }
            : {}),
        }
      : {
          files: completedFiles,
          skipped: skippedFiles,
          products: uniqueProducts.length,
        };

  return { blob, result };
}

export function downloadArchive(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
