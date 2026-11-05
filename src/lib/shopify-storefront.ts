import JSZip from "jszip";

export const DEFAULT_STORE_URL = "https://stienhardt.com";
export const SHOPIFY_PAGE_SIZE = 24;

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

export type ShopifyProductDetail = ShopifyProductSummary & {
  description?: string;
  price?: number;
  media?: ShopifyMedia[];
};

export type ExportProgress = {
  product: number;
  productCount: number;
  asset: number;
  assetCount: number;
  label: string;
};

export type ExportResult = { files: number; skipped: number };

function normalizeStoreUrl(value: string): URL {
  const candidate = value.trim();
  const parsed = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Enter a valid Shopify storefront address.");
  }
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed;
}

export function getStoreOrigin(value: string): string {
  return normalizeStoreUrl(value).origin;
}

export function getHighResolutionImageUrl(value: string): string {
  const url = new URL(value.startsWith("//") ? `https:${value}` : value);
  ["width", "height", "crop", "pad_color", "scale", "quality"].forEach((key) =>
    url.searchParams.delete(key),
  );
  return url.toString();
}

export function getBestMp4Source(sources: ShopifyVideoSource[]): ShopifyVideoSource | undefined {
  return sources
    .filter((source) => source.format === "mp4" || source.mime_type === "video/mp4")
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
}

export function safeAssetName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "asset";
}

function extensionFor(url: string, contentType?: string): string {
  const path = new URL(url).pathname;
  const match = path.match(/\.([a-zA-Z0-9]{2,5})$/);
  const matchedExtension = match?.[1];
  if (matchedExtension) return matchedExtension.toLowerCase();
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("mp4")) return "mp4";
  if (contentType?.includes("svg")) return "svg";
  return "jpg";
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`The store returned ${response.status}. Check the address and try again.`);
  }
  return (await response.json()) as T;
}

export async function fetchCollections(store: string): Promise<ShopifyCollection[]> {
  const origin = getStoreOrigin(store);
  const data = await readJson<{ collections?: ShopifyCollection[] }>(
    `${origin}/collections.json?limit=250&page=1`,
  );
  return data.collections ?? [];
}

export async function fetchCollectionProducts(
  store: string,
  handle: string,
  page: number,
): Promise<ShopifyProductSummary[]> {
  const origin = getStoreOrigin(store);
  const data = await readJson<{ products?: ShopifyProductSummary[] }>(
    `${origin}/collections/${encodeURIComponent(handle)}/products.json?limit=${SHOPIFY_PAGE_SIZE}&page=${page}`,
  );
  return data.products ?? [];
}

export async function fetchProductDetail(store: string, handle: string): Promise<ShopifyProductDetail> {
  const origin = getStoreOrigin(store);
  return readJson<ShopifyProductDetail>(`${origin}/products/${encodeURIComponent(handle)}.js`);
}

function getProductAssets(detail: ShopifyProductDetail, store: string) {
  const origin = getStoreOrigin(store);
  const imageUrls = new Set<string>();
  const videos: Array<{ url: string; height: number }> = [];

  for (const media of detail.media ?? []) {
    if (media.media_type === "image" && media.src) {
      imageUrls.add(getHighResolutionImageUrl(new URL(media.src, origin).toString()));
    }
    if (media.media_type === "video") {
      const best = getBestMp4Source(media.sources ?? []);
      if (best) videos.push({ url: best.url, height: best.height ?? 0 });
    }
  }

  if (imageUrls.size === 0) {
    for (const image of detail.images ?? []) {
      if (image.src) imageUrls.add(getHighResolutionImageUrl(new URL(image.src, origin).toString()));
    }
  }

  const imageAssets = Array.from(imageUrls).map((url, index) => ({
    url,
    path: `images/${String(index + 1).padStart(2, "0")}-${safeAssetName(detail.handle)}.${extensionFor(url)}`,
    label: `Image ${index + 1}`,
  }));
  const videoAssets = videos.map((video, index) => ({
    url: video.url,
    path: `videos/${String(index + 1).padStart(2, "0")}-${safeAssetName(detail.handle)}-${video.height}p.mp4`,
    label: `Video ${index + 1} · ${video.height}p`,
  }));
  return [...imageAssets, ...videoAssets];
}

async function addRemoteFile(zip: JSZip, url: string, path: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`File returned ${response.status}`);
  const blob = await response.blob();
  zip.file(path.replace(/\.[^.]+$/, `.${extensionFor(url, blob.type)}`), blob);
}

export async function createProductsArchive(
  store: string,
  collection: ShopifyCollection,
  products: ShopifyProductSummary[],
  onProgress: (progress: ExportProgress) => void,
): Promise<{ blob: Blob; result: ExportResult }> {
  const zip = new JSZip();
  const collectionFolder = safeAssetName(collection.handle);
  let completedFiles = 0;
  let skippedFiles = 0;

  for (let productIndex = 0; productIndex < products.length; productIndex += 1) {
    const summary = products.at(productIndex);
    if (!summary) continue;
    onProgress({
      product: productIndex + 1,
      productCount: products.length,
      asset: 0,
      assetCount: 0,
      label: summary.title,
    });
    try {
      const detail = await fetchProductDetail(store, summary.handle);
      const productFolder = `${collectionFolder}/products/${safeAssetName(summary.handle)}`;
      const assets = getProductAssets(detail, store);
      const productRecord = {
        id: detail.id,
        title: detail.title,
        handle: detail.handle,
        vendor: detail.vendor ?? null,
        productType: detail.product_type ?? null,
        description: detail.description ?? "",
        price: detail.price ?? null,
        source: `${getStoreOrigin(store)}/products/${detail.handle}`,
        media: assets.map(({ path, url, label }) => ({ path, url, label })),
      };
      zip.file(`${productFolder}/product.json`, JSON.stringify(productRecord, null, 2));

      for (let assetIndex = 0; assetIndex < assets.length; assetIndex += 1) {
        const asset = assets.at(assetIndex);
        if (!asset) continue;
        onProgress({
          product: productIndex + 1,
          productCount: products.length,
          asset: assetIndex + 1,
          assetCount: assets.length,
          label: `${summary.title} · ${asset.label}`,
        });
        try {
          await addRemoteFile(zip, asset.url, `${productFolder}/${asset.path}`);
          completedFiles += 1;
        } catch {
          skippedFiles += 1;
        }
      }
      if (assets.length === 0) skippedFiles += 1;
    } catch {
      skippedFiles += 1;
    }
  }

  const cover = collection.image?.src;
  if (cover) {
    try {
      await addRemoteFile(zip, getHighResolutionImageUrl(cover), `${collectionFolder}/collection-cover.jpg`);
      completedFiles += 1;
    } catch {
      skippedFiles += 1;
    }
  }

  zip.file(
    `${collectionFolder}/manifest.json`,
    JSON.stringify(
      {
        collection: { title: collection.title, handle: collection.handle },
        store: getStoreOrigin(store),
        exportedAt: new Date().toISOString(),
        products: products.map(({ title, handle }) => ({ title, handle })),
        filesDownloaded: completedFiles,
        filesSkipped: skippedFiles,
      },
      null,
      2,
    ),
  );

  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" }, (metadata) => {
    onProgress({
      product: products.length,
      productCount: products.length,
      asset: Math.round(metadata.percent),
      assetCount: 100,
      label: "Packing product folders",
    });
  });
  return { blob, result: { files: completedFiles, skipped: skippedFiles } };
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