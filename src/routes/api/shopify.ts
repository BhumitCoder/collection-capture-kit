import { createFileRoute } from "@tanstack/react-router";

import { buildShopifyProxyTarget, fetchPublicResource } from "@/lib/proxy-security";

export const Route = createFileRoute("/api/shopify")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const store = url.searchParams.get("store") ?? "";
        const type = url.searchParams.get("type") ?? "";
        const handle = url.searchParams.get("handle");
        const page = url.searchParams.get("page");
        const limit = url.searchParams.get("limit");

        let target: URL;
        try {
          target = buildShopifyProxyTarget({ store, type, handle, page, limit });
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Invalid store request.";
          return Response.json({ error: message }, { status: 400 });
        }

        try {
          const upstream = await fetchPublicResource(target, {
            accept: "application/json",
            timeoutMs: 15_000,
            signal: request.signal,
          });

          if (!upstream.ok) {
            return Response.json(
              {
                error: `The store returned ${upstream.status}. Check the address and try again.`,
              },
              { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 },
            );
          }

          const contentType = upstream.headers.get("content-type") ?? "";
          const text = await upstream.text();

          if (!contentType.includes("json") && !text.trimStart().startsWith("{")) {
            return Response.json(
              { error: "This address did not return public Shopify storefront JSON." },
              { status: 502 },
            );
          }

          return new Response(text, {
            status: 200,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
            },
          });
        } catch (cause) {
          const message =
            cause instanceof Error && cause.name === "AbortError"
              ? "The store took too long to respond."
              : "Could not reach this Shopify storefront. Check the address and try again.";
          return Response.json({ error: message }, { status: 502 });
        }
      },
    },
  },
});
