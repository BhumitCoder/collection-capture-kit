import { createFileRoute } from "@tanstack/react-router";

import { assertPublicHttpsUrl, fetchPublicResource } from "@/lib/proxy-security";

const ALLOWED_MEDIA_PREFIXES = ["image/", "video/", "application/octet-stream"];

export const Route = createFileRoute("/api/media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const rawTarget = url.searchParams.get("url") ?? "";

        let target: URL;
        try {
          target = assertPublicHttpsUrl(rawTarget);
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Invalid media URL.";
          return Response.json({ error: message }, { status: 400 });
        }

        try {
          const upstream = await fetchPublicResource(target, {
            accept: "image/*,video/*,*/*;q=0.8",
            timeoutMs: 30_000,
            signal: request.signal,
          });

          if (!upstream.ok || !upstream.body) {
            return Response.json(
              { error: `Media host returned ${upstream.status}.` },
              { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 },
            );
          }

          const contentType = (
            upstream.headers.get("content-type") ?? "application/octet-stream"
          ).toLowerCase();

          if (!ALLOWED_MEDIA_PREFIXES.some((prefix) => contentType.startsWith(prefix))) {
            return Response.json(
              { error: "Remote URL did not return an image or video asset." },
              { status: 415 },
            );
          }

          const headers = new Headers({
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=3600",
            "X-Content-Type-Options": "nosniff",
          });
          const contentLength = upstream.headers.get("content-length");
          if (contentLength) {
            headers.set("Content-Length", contentLength);
          }

          return new Response(upstream.body, {
            status: 200,
            headers,
          });
        } catch (cause) {
          const message =
            cause instanceof Error && cause.name === "AbortError"
              ? "The media download timed out."
              : "Could not stream remote media asset.";
          return Response.json({ error: message }, { status: 502 });
        }
      },
    },
  },
});
