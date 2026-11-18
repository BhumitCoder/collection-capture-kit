import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

describe("App routing", () => {
  it("matches /, /inspect, and server proxy API routes instead of falling back to not found", () => {
    const router = createRouter({ routeTree });

    for (const pathname of ["/", "/inspect", "/api/shopify", "/api/media"]) {
      const matches = router.matchRoutes(pathname);
      expect(matches.at(-1)?.routeId, pathname).not.toBe(rootRouteId);
    }
  });
});
