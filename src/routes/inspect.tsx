import { createFileRoute } from "@tanstack/react-router";

import { ImageInspector } from "@/components/image-inspector";
import { Topbar } from "@/components/topbar";

export const Route = createFileRoute("/inspect")({
  head: () => ({
    meta: [
      { title: "Image Details & Metadata Cleaner | Studio Vault" },
      {
        name: "description",
        content:
          "Inspect EXIF, XMP, color profiles, file structure, and visual fingerprints locally in your browser, then export metadata-free copies.",
      },
      { property: "og:title", content: "Image Details & Metadata Cleaner | Studio Vault" },
      {
        property: "og:description",
        content:
          "Audit image metadata privately on your device and download clean metadata-free copies.",
      },
    ],
  }),
  component: InspectPage,
});

function InspectPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Topbar
        activePage="inspect"
        caption="IMAGE INSPECTION"
        statusText="Private · Browser-only processing"
      />
      <ImageInspector />
    </div>
  );
}
