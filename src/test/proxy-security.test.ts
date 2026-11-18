import { describe, expect, it } from "vitest";

import { assertPublicHttpsUrl, buildShopifyProxyTarget } from "@/lib/proxy-security";

describe("proxy SSRF and URL validation", () => {
  it("allows valid public HTTPS storefront and CDN URLs", () => {
    expect(assertPublicHttpsUrl("https://stienhardt.com/collections.json").hostname).toBe(
      "stienhardt.com",
    );
    expect(assertPublicHttpsUrl("https://cdn.shopify.com/s/files/1/photo.jpg").hostname).toBe(
      "cdn.shopify.com",
    );
  });

  it("blocks non-HTTPS protocols, credentials, non-standard ports, and private hosts", () => {
    const blocked = [
      "http://stienhardt.com/collections.json",
      "file:///etc/passwd",
      "https://user:pass@stienhardt.com/",
      "https://stienhardt.com:8443/",
      "https://localhost/collections.json",
      "https://127.0.0.1/collections.json",
      "https://10.0.0.1/collections.json",
      "https://172.16.0.5/collections.json",
      "https://192.168.1.1/collections.json",
      "https://169.254.169.254/latest/meta-data/",
      "https://[::1]/",
      "https://[fe80::1]/",
      "https://[::ffff:127.0.0.1]/",
      "https://2130706433/",
      "https://internal.local/",
    ];

    for (const candidate of blocked) {
      expect(() => assertPublicHttpsUrl(candidate), candidate).toThrow();
    }
  });

  it("builds valid Shopify JSON proxy targets and rejects malformed handles", () => {
    expect(
      buildShopifyProxyTarget({ store: "stienhardt.com", type: "collections", page: "2" }).href,
    ).toBe("https://stienhardt.com/collections.json?limit=250&page=2");

    expect(
      buildShopifyProxyTarget({
        store: "https://stienhardt.com/collections/rings",
        type: "products",
        handle: "diamond-rings",
        page: "3",
        limit: "24",
      }).href,
    ).toBe("https://stienhardt.com/collections/diamond-rings/products.json?limit=24&page=3");

    expect(
      buildShopifyProxyTarget({
        store: "https://stienhardt.com",
        type: "product",
        handle: "oval-solitaire",
      }).href,
    ).toBe("https://stienhardt.com/products/oval-solitaire.js");

    expect(() =>
      buildShopifyProxyTarget({
        store: "https://stienhardt.com",
        type: "product",
        handle: "../admin",
      }),
    ).toThrow("Invalid Shopify handle.");
  });
});
