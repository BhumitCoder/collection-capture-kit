import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("renders and toggles the Clean A–Z ZIP export option in the catalog dock", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("type=collections")) {
        return new Response(
          JSON.stringify({
            collections: [
              {
                id: 1,
                title: "Engagement Rings",
                handle: "engagement-rings",
                products_count: 1,
                image: null,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          products: [
            {
              id: 101,
              title: "Emerald Solitaire",
              handle: "emerald-solitaire",
              vendor: "Studio",
              images: [{ src: "https://cdn.shopify.com/s/files/1/ring.jpg" }],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText("Emerald Solitaire")).toBeInTheDocument();
    });

    // Clean A-Z toggle is available and enabled by default in the download bar
    const cleanSwitch = screen.getByRole("switch", { name: /Clean A–Z/i });
    expect(cleanSwitch).toHaveAttribute("aria-checked", "true");

    // Clicking toggles Clean A-Z off
    fireEvent.click(cleanSwitch);
    expect(cleanSwitch).toHaveAttribute("aria-checked", "false");

    // Clicking again restores Clean A-Z on
    fireEvent.click(cleanSwitch);
    expect(cleanSwitch).toHaveAttribute("aria-checked", "true");

    // Selecting a product shows the selected dock with the Clean A-Z option still synced
    fireEvent.click(screen.getByRole("button", { name: /Select Emerald Solitaire/i }));
    await waitFor(() => {
      expect(screen.getByText(/Download selected/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("switch", { name: /Clean A–Z/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
