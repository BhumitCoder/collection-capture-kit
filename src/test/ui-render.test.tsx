import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

describe("Studio Vault pages", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the catalog error banner even when no collection is active", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Store unavailable for testing." }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Store unavailable for testing.");
    });
  });

  it("renders the /inspect route cleanly without hook errors", async () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/inspect"] }),
    });

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Image details & clean copies/i }),
      ).toBeInTheDocument();
    });
  });
});
