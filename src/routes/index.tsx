import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Gem,
  Image as ImageIcon,
  LoaderCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Video,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageInspector } from "@/components/image-inspector";
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
      { title: "Shopify Collection Media Exporter | Studio Vault" },
      {
        name: "description",
        content: "Browse Shopify collections and download full-quality product photos and available HD videos in organized folders.",
      },
      { property: "og:title", content: "Shopify Collection Media Exporter | Studio Vault" },
      {
        property: "og:description",
        content: "Browse Shopify collections and export product media in organized folders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [view, setView] = useState<"catalog" | "inspect">("catalog");
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
    filteredProducts.length > 0 && filteredProducts.every((product) => selected.has(product.handle));

  if (view === "inspect") {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <header className="topbar">
          <div className="topbar-brand">
            <span className="brand-mark"><Gem aria-hidden="true" /></span>
            <span className="brand-word">STUDIO <span>VAULT</span></span>
          </div>
          <div className="topbar-divider" />
          <div className="topbar-caption">IMAGE INSPECTION</div>
          <nav className="topbar-nav" aria-label="Workspace">
            <Button variant="ghost" size="sm" onClick={() => setView("catalog")}>Shopify library</Button>
            <Button variant="outline" size="sm" aria-current="page">Image details</Button>
          </nav>
        </header>
        <ImageInspector />
      </div>
    );
  }

  const loadCollectionList = async (nextStore = store) => {
    setLoadingCollections(true);
    setError("");
    setNotice("");
    try {
      const origin = getStoreOrigin(nextStore);
      const results = await fetchCollections(origin);
      setCollections(results.sort((a, b) => a.title.localeCompare(b.title)));
      setStore(origin);
      setStoreInput(origin);
      setActiveCollection(null);
      setProducts([]);
      setPage(1);
      setSelected(new Set());
      if (results.length === 0) setNotice("No public collections were found for this store.");
      const firstCollection = results.find((collection) => collection.products_count > 0);
      if (firstCollection) void openCollection(firstCollection, origin);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read this store.");
    } finally {
      setLoadingCollections(false);
    }
  };

  useEffect(() => {
    void loadCollectionList(DEFAULT_STORE_URL);
    // Load the example store once when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCollection = async (collection: ShopifyCollection, storeOrigin = store) => {
    setActiveCollection(collection);
    setProducts([]);
    setPage(1);
    setSelected(new Set());
    setProductSearch("");
    setError("");
    setNotice("");
    setLoadingProducts(true);
    try {
      const results = await fetchCollectionProducts(storeOrigin, collection.handle, 1);
      setProducts(results);
      setHasMore(results.length === SHOPIFY_PAGE_SIZE);
      if (results.length === 0) setNotice("This collection has no publicly listed products.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load products for this collection.");
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadMore = async () => {
    if (!activeCollection || loadingProducts) return;
    const nextPage = page + 1;
    setLoadingProducts(true);
    setError("");
    try {
      const results = await fetchCollectionProducts(store, activeCollection.handle, nextPage);
      setProducts((current) => [...current, ...results]);
      setPage(nextPage);
      setHasMore(results.length === SHOPIFY_PAGE_SIZE);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load more products.");
    } finally {
      setLoadingProducts(false);
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

  const exportProducts = async (items = selectedProducts) => {
    if (!activeCollection || items.length === 0 || exporting) return;
    setExporting(true);
    setError("");
    setNotice("");
    try {
      const { blob, result } = await createProductsArchive(store, activeCollection, items, setProgress);
      downloadArchive(blob, `${activeCollection.handle}-media.zip`);
      setNotice(
        `Downloaded ${result.files} media file${result.files === 1 ? "" : "s"} in product folders${
          result.skipped ? ` · ${result.skipped} unavailable file${result.skipped === 1 ? "" : "s"} skipped` : ""
        }.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The archive could not be prepared.");
    } finally {
      setExporting(false);
      setProgress(null);
    }
  };

  const exportVisibleCollection = async () => {
    if (!activeCollection || exporting || products.length === 0) return;
    setExporting(true);
    setError("");
    setNotice("");
    try {
      const allProducts = [...products];
      let nextPage = page;
      let canContinue = hasMore;
      while (canContinue) {
        nextPage += 1;
        const nextProducts = await fetchCollectionProducts(store, activeCollection.handle, nextPage);
        allProducts.push(...nextProducts);
        canContinue = nextProducts.length === SHOPIFY_PAGE_SIZE;
        setProgress({ product: allProducts.length, productCount: activeCollection.products_count || allProducts.length, asset: 0, assetCount: 0, label: "Finding collection products" });
      }
      const { blob, result } = await createProductsArchive(store, activeCollection, allProducts, setProgress);
      downloadArchive(blob, `${activeCollection.handle}-media.zip`);
      setNotice(
        `Downloaded ${result.files} media file${result.files === 1 ? "" : "s"} across ${allProducts.length} product folders${
          result.skipped ? ` · ${result.skipped} unavailable file${result.skipped === 1 ? "" : "s"} skipped` : ""
        }.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The archive could not be prepared.");
    } finally {
      setExporting(false);
      setProgress(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-mark"><Gem aria-hidden="true" /></span>
          <span className="brand-word">STUDIO <span>VAULT</span></span>
        </div>
        <div className="topbar-divider" />
        <div className="topbar-caption">SHOPIFY MEDIA LIBRARY</div>
        <nav className="topbar-nav" aria-label="Workspace">
          <Button variant="outline" size="sm" aria-current="page">Shopify library</Button>
          <Button variant="ghost" size="sm" onClick={() => setView("inspect")}>Image details</Button>
        </nav>
        <div className="topbar-right">
          <span className="connection-dot" />
          <span>{collections.length ? `${collections.length} collections indexed` : "Storefront browser"}</span>
          <CircleHelp className="help-icon" aria-label="Media availability" />
        </div>
      </header>

      <main className="workspace">
        <aside className="collection-sidebar">
          <div className="sidebar-heading">
            <div>
              <div className="eyebrow">YOUR LIBRARY</div>
              <h1>Collections</h1>
            </div>
            <Badge variant="outline" className="count-badge">{collections.length}</Badge>
          </div>
          <form className="store-form" onSubmit={(event) => { event.preventDefault(); void loadCollectionList(storeInput); }}>
            <label htmlFor="store-url">STORE ADDRESS</label>
            <div className="store-input-row">
              <Input id="store-url" value={storeInput} onChange={(event) => setStoreInput(event.target.value)} placeholder="your-store.myshopify.com" />
              <Button type="submit" variant="outline" size="icon" aria-label="Load store" title="Load store" disabled={loadingCollections}>
                {loadingCollections ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
              </Button>
            </div>
          </form>
          <div className="sidebar-search">
            <Search aria-hidden="true" />
            <Input value={collectionSearch} onChange={(event) => setCollectionSearch(event.target.value)} placeholder="Find a collection" aria-label="Find a collection" />
            {collectionSearch && <Button type="button" variant="ghost" size="icon" aria-label="Clear collection search" onClick={() => setCollectionSearch("")}><X /></Button>}
          </div>
          <div className="collection-list" aria-label="Collections">
            {loadingCollections && collections.length === 0 ? (
              <div className="sidebar-loading"><LoaderCircle className="animate-spin" /> Reading collections…</div>
            ) : filteredCollections.length === 0 ? (
              <div className="sidebar-empty">No matching collections</div>
            ) : filteredCollections.map((collection, index) => (
              <button
                type="button"
                key={collection.id}
                className={`collection-row ${activeCollection?.id === collection.id ? "is-active" : ""}`}
                onClick={() => void openCollection(collection)}
              >
                <span className="collection-thumbnail" aria-hidden="true">
                  {collection.image?.src ? (
                    <img src={getHighResolutionImageUrl(collection.image.src)} alt="" loading="lazy" />
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
            ))}
          </div>
          <div className="sidebar-footer"><ShieldCheck aria-hidden="true" /> Public storefront media only</div>
        </aside>

        <section className="catalog-area">
          {activeCollection ? (
            <>
              <div className="breadcrumb-line">
                <Button variant="ghost" size="sm" className="back-to-collections" onClick={() => { setActiveCollection(null); setProducts([]); setSelected(new Set()); }}>
                  <ArrowLeft /> Collections
                </Button>
                <span className="crumb-slash">/</span>
                <span>{activeCollection.title}</span>
              </div>
              <section className="collection-cover">
                {activeCollection.image?.src ? (
                  <img src={getHighResolutionImageUrl(activeCollection.image.src)} alt={activeCollection.image.alt || activeCollection.title} />
                ) : <div className="cover-placeholder"><Gem /></div>}
                <div className="cover-shade" />
                <div className="cover-content">
                  <span className="cover-kicker"><Sparkles /> COLLECTION</span>
                  <h2>{activeCollection.title}</h2>
                  <p>{activeCollection.products_count} pieces <span>·</span> {store.replace(/^https?:\/\//, "")}</p>
                </div>
                <div className="cover-stamp">MEDIA<br />ARCHIVE</div>
              </section>

              <div className="catalog-toolbar">
                <div className="toolbar-title">
                  <div className="eyebrow">PRODUCTS</div>
                  <h2>{products.length}{activeCollection.products_count > products.length ? <span> / {activeCollection.products_count}</span> : null}</h2>
                </div>
                <div className="toolbar-actions">
                  <div className="product-search"><Search aria-hidden="true" /><Input aria-label="Search products" placeholder="Search products" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} />{productSearch && <Button type="button" variant="ghost" size="icon" aria-label="Clear product search" onClick={() => setProductSearch("")}><X /></Button>}</div>
                  <Button variant="outline" size="sm" className="select-all-button" onClick={toggleVisibleProducts} disabled={filteredProducts.length === 0}>
                    {allVisibleSelected ? <CheckCheck /> : <Check />} {allVisibleSelected ? "Clear" : "Select page"}
                  </Button>
                </div>
              </div>

              {error && <div className="message message-error" role="alert">{error}<Button variant="ghost" size="icon" aria-label="Dismiss error" onClick={() => setError("")}><X /></Button></div>}
              {notice && <div className="message message-success" role="status"><Check /> {notice}<Button variant="ghost" size="icon" aria-label="Dismiss message" onClick={() => setNotice("")}><X /></Button></div>}

              {loadingProducts && products.length === 0 ? (
                <div className="product-loading"><LoaderCircle className="animate-spin" /><span>Opening this collection…</span></div>
              ) : filteredProducts.length === 0 ? (
                <div className="product-empty"><ImageIcon /><h3>{products.length ? "No products match" : "No listed products"}</h3><p>{products.length ? "Try a different search." : "This collection has no products available through the storefront."}</p></div>
              ) : (
                <div className="product-grid">
                  {filteredProducts.map((product, index) => {
                    const checked = selected.has(product.handle);
                    const photo = product.images?.[0]?.src;
                    return (
                      <article key={product.id} className={`product-card ${checked ? "is-selected" : ""}`}>
                        <button type="button" className="product-image-button" onClick={() => toggleProduct(product.handle)} aria-label={`${checked ? "Deselect" : "Select"} ${product.title}`}>
                          {photo ? <img src={getHighResolutionImageUrl(photo)} alt={product.images[0]?.alt || product.title} loading={index > 5 ? "lazy" : "eager"} /> : <span className="product-no-image"><ImageIcon /></span>}
                          <span className={`product-check ${checked ? "checked" : ""}`}>{checked && <Check />}</span>
                          <span className="product-image-count"><ImageIcon /> {product.images?.length ?? 0}</span>
                        </button>
                        <div className="product-card-info">
                          <span className="product-vendor">{product.vendor || product.product_type || "PRODUCT"}</span>
                          <h3>{product.title}</h3>
                          <span className="product-handle">/{product.handle}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {hasMore && !productSearch && <div className="load-more-row"><Button variant="outline" onClick={() => void loadMore()} disabled={loadingProducts}>{loadingProducts ? <LoaderCircle className="animate-spin" /> : <ChevronDown />}{loadingProducts ? "Loading…" : "Load more products"}</Button></div>}
              {!hasMore && products.length > 0 && <div className="end-of-list">END OF COLLECTION <span>✦</span></div>}
            </>
          ) : (
            <div className="empty-library">
              <div className="empty-orbit"><Gem /></div>
              <div className="eyebrow">SHOPIFY STOREFRONT</div>
              <h2>Bring every piece<br />into focus.</h2>
              <p>Choose a collection to explore its products and gather original-quality photos and available video into a neatly organized download.</p>
              <div className="empty-features">
                <span><ImageIcon /> Original product photos</span>
                <span><Video /> Highest available HD video</span>
                <span><ArrowDownToLine /> Product-by-product folders</span>
              </div>
              <div className="empty-hint"><ArrowLeft /> Pick a collection from your library</div>
            </div>
          )}
        </section>
      </main>

      {selectedProducts.length > 0 && activeCollection && (
        <div className="download-dock">
          <div className="dock-selection"><span className="dock-check"><Check /></span><strong>{selectedProducts.length}</strong> product{selectedProducts.length === 1 ? "" : "s"} selected</div>
          {exporting && <div className="export-progress"><LoaderCircle className="animate-spin" /><span>{progress?.label ?? "Preparing download…"}</span><span>{progress && progress.productCount > 0 ? `${Math.min(100, Math.round((progress.product / progress.productCount) * 100))}%` : ""}</span></div>}
          <div className="dock-actions">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={exporting}>Clear</Button>
            <Button variant="outline" size="sm" className="download-current" onClick={() => void exportProducts()} disabled={exporting}>
              {exporting ? <LoaderCircle className="animate-spin" /> : <ArrowDownToLine />} Download selected
            </Button>
            <Button size="sm" className="download-collection" onClick={() => void exportVisibleCollection()} disabled={exporting || products.length === 0}>
              {exporting ? <LoaderCircle className="animate-spin" /> : <ArrowDownToLine />} Download collection
            </Button>
          </div>
        </div>
      )}

      {selectedProducts.length === 0 && activeCollection && products.length > 0 && (
        <div className="download-nudge"><span><Video /> Product photos and available HD video</span><Button variant="outline" size="sm" className="download-current" onClick={() => void exportVisibleCollection()} disabled={exporting}>{exporting ? <LoaderCircle className="animate-spin" /> : <ArrowDownToLine />} Download collection</Button></div>
      )}
    </div>
  );
}
