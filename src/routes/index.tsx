import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  Gem,
  Image as ImageIcon,
  LoaderCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Video,
  X,
} from "lucide-react";

import { Topbar } from "@/components/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createProductsArchive,
  DEFAULT_STORE_URL,
  downloadArchive,
  fetchCollectionProducts,
  fetchCollections,
  getHighResolutionImageUrl,
  getStoreOrigin,
  SHOPIFY_PAGE_SIZE,
  type ExportProgress,
  type ShopifyCollection,
  type ShopifyProductSummary,
} from "@/lib/shopify-storefront";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Studio Vault | Shopify Collection Media Exporter" },
      {
        name: "description",
        content:
          "Browse Shopify collections and download full-quality product photos and available HD videos in organized folders.",
      },
      { property: "og:title", content: "Studio Vault | Shopify Collection Media Exporter" },
      {
        property: "og:description",
        content: "Browse Shopify collections and export product media in organized folders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === "AbortError";
}

function mergeUniqueProducts(
  existing: ShopifyProductSummary[],
  incoming: ShopifyProductSummary[],
): ShopifyProductSummary[] {
  const seen = new Set(existing.map((item) => item.handle));
  const merged = [...existing];
  for (const item of incoming) {
    if (!seen.has(item.handle)) {
      seen.add(item.handle);
      merged.push(item);
    }
  }
  return merged;
}

function Index() {
  const [storeInput, setStoreInput] = useState(DEFAULT_STORE_URL);
  const [store, setStore] = useState(DEFAULT_STORE_URL);
  const [collections, setCollections] = useState<ShopifyCollection[]>([]);
  const [activeCollection, setActiveCollection] = useState<ShopifyCollection | null>(null);
  const [products, setProducts] = useState<ShopifyProductSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [collectionSearch, setCollectionSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  const collectionsAbortRef = useRef<AbortController | null>(null);
  const productsAbortRef = useRef<AbortController | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);

  const filteredCollections = useMemo(() => {
    const query = collectionSearch.trim().toLowerCase();
    if (!query) return collections;
    return collections.filter((item) => item.title.toLowerCase().includes(query));
  }, [collections, collectionSearch]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) => product.title.toLowerCase().includes(query));
  }, [products, productSearch]);

  const selectedProducts = useMemo(
    () => products.filter((product) => selected.has(product.handle)),
    [products, selected],
  );

  const allVisibleSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((product) => selected.has(product.handle));

  const openCollection = useCallback(
    async (collection: ShopifyCollection, storeOrigin = store) => {
      productsAbortRef.current?.abort();
      const controller = new AbortController();
      productsAbortRef.current = controller;

      setActiveCollection(collection);
      setProducts([]);
      setPage(1);
      setHasMore(false);
      setSelected(new Set());
      setProductSearch("");
      setError("");
      setNotice("");
      setLoadingProducts(true);

      try {
        const results = await fetchCollectionProducts(
          storeOrigin,
          collection.handle,
          1,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setProducts(results);
        setHasMore(results.length === SHOPIFY_PAGE_SIZE);
        if (results.length === 0) setNotice("This collection has no publicly listed products.");
      } catch (cause) {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setError(
          cause instanceof Error ? cause.message : "Could not load products for this collection.",
        );
      } finally {
        if (productsAbortRef.current === controller) {
          setLoadingProducts(false);
        }
      }
    },
    [store],
  );

  const loadCollectionList = useCallback(
    async (nextStore: string) => {
      collectionsAbortRef.current?.abort();
      productsAbortRef.current?.abort();
      const controller = new AbortController();
      collectionsAbortRef.current = controller;

      setLoadingCollections(true);
      setLoadingProducts(false);
      setError("");
      setNotice("");

      try {
        const origin = getStoreOrigin(nextStore);
        const results = await fetchCollections(origin, controller.signal);
        if (controller.signal.aborted) return;

        const sorted = [...results].sort((a, b) => a.title.localeCompare(b.title));
        setCollections(sorted);
        setStore(origin);
        setStoreInput(origin);
        setActiveCollection(null);
        setProducts([]);
        setPage(1);
        setHasMore(false);
        setSelected(new Set());

        if (sorted.length === 0) {
          setNotice("No public collections were found for this store.");
          return;
        }
        const firstCollection = sorted.find((collection) => collection.products_count > 0);
        if (firstCollection) {
          void openCollection(firstCollection, origin);
        }
      } catch (cause) {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setCollections([]);
        setActiveCollection(null);
        setProducts([]);
        setSelected(new Set());
        setError(cause instanceof Error ? cause.message : "Could not read this store.");
      } finally {
        if (collectionsAbortRef.current === controller) {
          setLoadingCollections(false);
        }
      }
    },
    [openCollection],
  );

  useEffect(() => {
    void loadCollectionList(DEFAULT_STORE_URL);
    return () => {
      collectionsAbortRef.current?.abort();
      productsAbortRef.current?.abort();
      exportAbortRef.current?.abort();
    };
  }, [loadCollectionList]);

  const loadMore = async () => {
    if (!activeCollection || loadingProducts) return;
    productsAbortRef.current?.abort();
    const controller = new AbortController();
    productsAbortRef.current = controller;

    const nextPage = page + 1;
    setLoadingProducts(true);
    setError("");
    try {
      const results = await fetchCollectionProducts(
        store,
        activeCollection.handle,
        nextPage,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setProducts((current) => mergeUniqueProducts(current, results));
      setPage(nextPage);
      setHasMore(results.length === SHOPIFY_PAGE_SIZE);
    } catch (cause) {
      if (controller.signal.aborted || isAbortError(cause)) return;
      setError(cause instanceof Error ? cause.message : "Could not load more products.");
    } finally {
      if (productsAbortRef.current === controller) {
        setLoadingProducts(false);
      }
    }
  };

  const toggleProduct = (handle: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });
  };

  const toggleVisibleProducts = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) filteredProducts.forEach((product) => next.delete(product.handle));
      else filteredProducts.forEach((product) => next.add(product.handle));
      return next;
    });
  };

  const cancelExport = () => {
    exportAbortRef.current?.abort();
  };

  const exportProducts = async (items = selectedProducts) => {
    if (!activeCollection || items.length === 0 || exporting) return;
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExporting(true);
    setError("");
    setNotice("");
    try {
      const { blob, result } = await createProductsArchive(
        store,
        activeCollection,
        items,
        setProgress,
        controller.signal,
      );
      downloadArchive(blob, `${activeCollection.handle}-media.zip`);
      setNotice(
        `Downloaded ${result.files} media file${result.files === 1 ? "" : "s"} in ${result.products} product folder${result.products === 1 ? "" : "s"}${
          result.skipped
            ? ` · ${result.skipped} unavailable file${result.skipped === 1 ? "" : "s"} skipped`
            : ""
        }.`,
      );
    } catch (cause) {
      if (controller.signal.aborted || isAbortError(cause)) {
        setNotice("Export cancelled.");
      } else {
        setError(cause instanceof Error ? cause.message : "The archive could not be prepared.");
      }
    } finally {
      exportAbortRef.current = null;
      setExporting(false);
      setProgress(null);
    }
  };

  const exportVisibleCollection = async () => {
    if (!activeCollection || exporting || products.length === 0) return;
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExporting(true);
    setError("");
    setNotice("");
    try {
      let allProducts = [...products];
      let nextPage = page;
      let canContinue = hasMore;
      while (canContinue) {
        if (controller.signal.aborted) break;
        nextPage += 1;
        const nextProducts = await fetchCollectionProducts(
          store,
          activeCollection.handle,
          nextPage,
          controller.signal,
        );
        allProducts = mergeUniqueProducts(allProducts, nextProducts);
        canContinue = nextProducts.length === SHOPIFY_PAGE_SIZE;
        setProgress({
          product: allProducts.length,
          productCount: Math.max(activeCollection.products_count, allProducts.length),
          asset: 0,
          assetCount: 0,
          label: "Finding collection products",
        });
      }
      if (!controller.signal.aborted) {
        setProducts(allProducts);
        setPage(nextPage);
        setHasMore(false);
      }

      const { blob, result } = await createProductsArchive(
        store,
        activeCollection,
        allProducts,
        setProgress,
        controller.signal,
      );
      downloadArchive(blob, `${activeCollection.handle}-media.zip`);
      setNotice(
        `Downloaded ${result.files} media file${result.files === 1 ? "" : "s"} across ${result.products} product folder${result.products === 1 ? "" : "s"}${
          result.skipped
            ? ` · ${result.skipped} unavailable file${result.skipped === 1 ? "" : "s"} skipped`
            : ""
        }.`,
      );
    } catch (cause) {
      if (controller.signal.aborted || isAbortError(cause)) {
        setNotice("Export cancelled.");
      } else {
        setError(cause instanceof Error ? cause.message : "The archive could not be prepared.");
      }
    } finally {
      exportAbortRef.current = null;
      setExporting(false);
      setProgress(null);
    }
  };

  const progressPercent =
    progress && progress.productCount > 0
      ? `${Math.min(100, Math.round((progress.product / progress.productCount) * 100))}%`
      : "";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Topbar
        activePage="catalog"
        caption="SHOPIFY MEDIA LIBRARY"
        statusText={
          collections.length ? `${collections.length} collections indexed` : "Storefront browser"
        }
      />

      <main className="workspace">
        <aside className="collection-sidebar">
          <div className="sidebar-heading">
            <div>
              <div className="eyebrow">YOUR LIBRARY</div>
              <h1>Collections</h1>
            </div>
            <Badge variant="outline" className="count-badge">
              {collections.length}
            </Badge>
          </div>
          <form
            className="store-form"
            onSubmit={(event) => {
              event.preventDefault();
              void loadCollectionList(storeInput);
            }}
          >
            <label htmlFor="store-url">STORE ADDRESS</label>
            <div className="store-input-row">
              <Input
                id="store-url"
                value={storeInput}
                onChange={(event) => setStoreInput(event.target.value)}
                placeholder="your-store.myshopify.com"
              />
              <Button
                type="submit"
                variant="outline"
                size="icon"
                aria-label="Load store"
                title="Load store"
                disabled={loadingCollections}
              >
                {loadingCollections ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
              </Button>
            </div>
          </form>
          <div className="sidebar-search">
            <Search aria-hidden="true" />
            <Input
              value={collectionSearch}
              onChange={(event) => setCollectionSearch(event.target.value)}
              placeholder="Find a collection"
              aria-label="Find a collection"
            />
            {collectionSearch && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Clear collection search"
                onClick={() => setCollectionSearch("")}
              >
                <X />
              </Button>
            )}
          </div>
          <div className="collection-list" aria-label="Collections">
            {loadingCollections && collections.length === 0 ? (
              <div className="sidebar-loading">
                <LoaderCircle className="animate-spin" /> Reading collections…
              </div>
            ) : filteredCollections.length === 0 ? (
              <div className="sidebar-empty">No matching collections</div>
            ) : (
              filteredCollections.map((collection, index) => (
                <button
                  type="button"
                  key={collection.id}
                  className={`collection-row ${activeCollection?.id === collection.id ? "is-active" : ""}`}
                  onClick={() => void openCollection(collection)}
                >
                  <span className="collection-thumbnail" aria-hidden="true">
                    {collection.image?.src ? (
                      <img
                        src={getHighResolutionImageUrl(collection.image.src, store)}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <Gem />
                    )}
                  </span>
                  <span className="collection-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="collection-copy">
                    <span className="collection-title">{collection.title}</span>
                    <span className="collection-count">{collection.products_count} products</span>
                  </span>
                  {activeCollection?.id === collection.id && <ArrowRight className="row-arrow" />}
                </button>
              ))
            )}
          </div>
          <div className="sidebar-footer">
            <ShieldCheck aria-hidden="true" /> Public storefront media only
          </div>
        </aside>

        <section className="catalog-area">
          {error && (
            <div className="message message-error" role="alert">
              <span>{error}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X />
              </Button>
            </div>
          )}
          {notice && (
            <div className="message message-success" role="status">
              <Check aria-hidden="true" /> <span>{notice}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X />
              </Button>
            </div>
          )}

          {activeCollection ? (
            <>
              <div className="breadcrumb-line">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="back-to-collections"
                  onClick={() => {
                    productsAbortRef.current?.abort();
                    setActiveCollection(null);
                    setProducts([]);
                    setSelected(new Set());
                  }}
                >
                  <ArrowLeft /> Collections
                </Button>
                <span className="crumb-slash">/</span>
                <span>{activeCollection.title}</span>
              </div>
              <section className="collection-cover">
                {activeCollection.image?.src ? (
                  <img
                    src={getHighResolutionImageUrl(activeCollection.image.src, store)}
                    alt={activeCollection.image.alt || activeCollection.title}
                  />
                ) : (
                  <div className="cover-placeholder">
                    <Gem aria-hidden="true" />
                  </div>
                )}
                <div className="cover-shade" />
                <div className="cover-content">
                  <span className="cover-kicker">
                    <Sparkles aria-hidden="true" /> COLLECTION
                  </span>
                  <h2>{activeCollection.title}</h2>
                  <p>
                    {activeCollection.products_count} pieces <span>·</span>{" "}
                    {store.replace(/^https?:\/\//, "")}
                  </p>
                </div>
                <div className="cover-stamp">
                  MEDIA
                  <br />
                  ARCHIVE
                </div>
              </section>

              <div className="catalog-toolbar">
                <div className="toolbar-title">
                  <div className="eyebrow">PRODUCTS</div>
                  <h2>
                    {products.length}
                    {activeCollection.products_count > products.length ? (
                      <span> / {activeCollection.products_count}</span>
                    ) : null}
                  </h2>
                </div>
                <div className="toolbar-actions">
                  <div className="product-search">
                    <Search aria-hidden="true" />
                    <Input
                      aria-label="Search products"
                      placeholder="Search products"
                      value={productSearch}
                      onChange={(event) => setProductSearch(event.target.value)}
                    />
                    {productSearch && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Clear product search"
                        onClick={() => setProductSearch("")}
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="select-all-button"
                    onClick={toggleVisibleProducts}
                    disabled={filteredProducts.length === 0}
                  >
                    {allVisibleSelected ? <CheckCheck /> : <Check />}{" "}
                    {allVisibleSelected ? "Clear" : "Select page"}
                  </Button>
                </div>
              </div>

              {loadingProducts && products.length === 0 ? (
                <div className="product-loading">
                  <LoaderCircle className="animate-spin" />
                  <span>Opening this collection…</span>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="product-empty">
                  <ImageIcon aria-hidden="true" />
                  <h3>{products.length ? "No products match" : "No listed products"}</h3>
                  <p>
                    {products.length
                      ? "Try a different search."
                      : "This collection has no products available through the storefront."}
                  </p>
                </div>
              ) : (
                <div className="product-grid">
                  {filteredProducts.map((product, index) => {
                    const checked = selected.has(product.handle);
                    const photo = product.images?.[0]?.src;
                    return (
                      <article
                        key={product.id}
                        className={`product-card ${checked ? "is-selected" : ""}`}
                      >
                        <button
                          type="button"
                          className="product-image-button"
                          onClick={() => toggleProduct(product.handle)}
                          aria-label={`${checked ? "Deselect" : "Select"} ${product.title}`}
                        >
                          {photo ? (
                            <img
                              src={getHighResolutionImageUrl(photo, store)}
                              alt={product.images[0]?.alt || product.title}
                              loading={index > 5 ? "lazy" : "eager"}
                            />
                          ) : (
                            <span className="product-no-image">
                              <ImageIcon aria-hidden="true" />
                            </span>
                          )}
                          <span className={`product-check ${checked ? "checked" : ""}`}>
                            {checked && <Check aria-hidden="true" />}
                          </span>
                          <span className="product-image-count">
                            <ImageIcon aria-hidden="true" /> {product.images?.length ?? 0}
                          </span>
                        </button>
                        <div className="product-card-info">
                          <span className="product-vendor">
                            {product.vendor || product.product_type || "PRODUCT"}
                          </span>
                          <h3>{product.title}</h3>
                          <span className="product-handle">/{product.handle}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {hasMore && !productSearch && (
                <div className="load-more-row">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void loadMore()}
                    disabled={loadingProducts}
                  >
                    {loadingProducts ? <LoaderCircle className="animate-spin" /> : <ChevronDown />}
                    {loadingProducts ? "Loading…" : "Load more products"}
                  </Button>
                </div>
              )}
              {!hasMore && products.length > 0 && (
                <div className="end-of-list">
                  END OF COLLECTION <span>✦</span>
                </div>
              )}
            </>
          ) : (
            <div className="empty-library">
              <div className="empty-orbit">
                <Gem aria-hidden="true" />
              </div>
              <div className="eyebrow">SHOPIFY STOREFRONT</div>
              <h2>
                Bring every piece
                <br />
                into focus.
              </h2>
              <p>
                Choose a collection to explore its products and gather original-quality photos and
                available video into a neatly organized download.
              </p>
              <div className="empty-features">
                <span>
                  <ImageIcon aria-hidden="true" /> Original product photos
                </span>
                <span>
                  <Video aria-hidden="true" /> Highest available HD video
                </span>
                <span>
                  <ArrowDownToLine aria-hidden="true" /> Product-by-product folders
                </span>
              </div>
              <div className="empty-hint">
                <ArrowLeft aria-hidden="true" /> Pick a collection from your library
              </div>
            </div>
          )}
        </section>
      </main>

      {selectedProducts.length > 0 && activeCollection && (
        <div className="download-dock">
          <div className="dock-selection">
            <span className="dock-check">
              <Check aria-hidden="true" />
            </span>
            <strong>{selectedProducts.length}</strong> product
            {selectedProducts.length === 1 ? "" : "s"} selected
          </div>
          {exporting && (
            <div className="export-progress" role="status" aria-live="polite">
              <LoaderCircle className="animate-spin" />
              <span>{progress?.label ?? "Preparing download…"}</span>
              <span>{progressPercent}</span>
            </div>
          )}
          <div className="dock-actions">
            {exporting ? (
              <Button type="button" variant="outline" size="sm" onClick={cancelExport}>
                <X /> Cancel
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="download-current"
              onClick={() => void exportProducts()}
              disabled={exporting}
            >
              {exporting ? <LoaderCircle className="animate-spin" /> : <ArrowDownToLine />} Download
              selected
            </Button>
            <Button
              type="button"
              size="sm"
              className="download-collection"
              onClick={() => void exportVisibleCollection()}
              disabled={exporting || products.length === 0}
            >
              {exporting ? <LoaderCircle className="animate-spin" /> : <ArrowDownToLine />} Download
              collection
            </Button>
          </div>
        </div>
      )}

      {selectedProducts.length === 0 && activeCollection && products.length > 0 && (
        <div className="download-nudge">
          {exporting ? (
            <div className="export-progress" role="status" aria-live="polite">
              <LoaderCircle className="animate-spin" />
              <span>{progress?.label ?? "Preparing download…"}</span>
              <span>{progressPercent}</span>
            </div>
          ) : (
            <span>
              <Video aria-hidden="true" /> Product photos and available HD video
            </span>
          )}
          <div className="dock-actions">
            {exporting && (
              <Button type="button" variant="ghost" size="sm" onClick={cancelExport}>
                <X /> Cancel
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="download-current"
              onClick={() => void exportVisibleCollection()}
              disabled={exporting}
            >
              {exporting ? <LoaderCircle className="animate-spin" /> : <ArrowDownToLine />} Download
              collection
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
