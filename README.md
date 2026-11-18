# Studio Vault

**Studio Vault** is a production web application for luxury & e-commerce teams to browse public Shopify collections, export original-resolution product photography and HD MP4 videos in structured product folders, and audit or strip image metadata locally in the browser.

## Features

- **Shopify Collection Media Exporter (`/`)**
  - Browse any public Shopify storefront with full collection pagination (>250 collections supported).
  - Server-side SSRF-protected proxy (`/api/shopify` & streaming `/api/media`) eliminates browser CORS errors across storefronts and video CDNs.
  - Automatically upgrades Shopify CDN image URLs (strips query parameters and legacy sizing suffixes such as `_800x800` / `_grande`) and selects the highest-resolution hosted MP4 video stream.
  - Exports structured ZIP archives with bounded concurrency, live progress, and cancel support:
    ```text
    <collection-handle>/
      manifest.json
      collection-cover.<ext>
      products/
        <product-handle>/
          product.json
          images/01-<handle>.<ext>
          videos/01-<handle>-1080p.mp4
    ```
- **Local Image Inspector & Metadata Cleaner (`/inspect`)**
  - Runs 100% client-side — source photos never leave the browser.
  - Inspects EXIF/XMP/IPTC/ICC metadata, binary file container structure (JPEG/PNG/WebP), SHA-256 & visual difference hashes, accurate opaque-pixel color palettes, luminance histograms, and embedded thumbnails.
  - Re-encodes full-resolution metadata-free copies locally.

## Local Development

Requires **Node.js 22 LTS** (`>=22.12.0`, configured automatically on Vercel via `package.json`).

```bash
npm install
npm run dev
```

### Verification Commands

```bash
npm run typecheck   # Strict TypeScript check
npm run lint        # ESLint + Prettier check
npm run test        # Vitest unit & component tests
npm run build       # Production SSR + client build
npm run check       # Run typecheck, lint, and test together
```

## Deploying to Vercel

This project uses **TanStack Start** with **Nitro**, which automatically detects Vercel and builds a native Build Output API v3 deployment (Vercel Functions + static assets).

### Option 1: Git Integration (Recommended)

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. Import the repository in the [Vercel Dashboard](https://vercel.com/new).
3. Keep the default settings (Vercel reads `vercel.json` automatically).
4. Optional: set `VITE_DEFAULT_STORE_URL` in Project Settings -> Environment Variables.
5. Click **Deploy**.

### Option 2: Vercel CLI

```bash
npx vercel
npx vercel --prod
```

## Architecture

| Path                            | Responsibility                                                       |
| ------------------------------- | -------------------------------------------------------------------- |
| `src/routes/index.tsx`          | Shopify collection browser & media archive exporter                  |
| `src/routes/inspect.tsx`        | Local browser-only image metadata inspector & cleaner                |
| `src/routes/api/shopify.ts`     | SSRF-protected server proxy for public Shopify JSON endpoints        |
| `src/routes/api/media.ts`       | SSRF-protected streaming proxy for CORS-restricted media assets      |
| `src/lib/shopify-storefront.ts` | Storefront normalization, asset resolution, and ZIP archive builder  |
| `src/lib/image-forensics.ts`    | Local EXIF/container parser, pixel analyzer, and clean-copy exporter |
| `src/lib/proxy-security.ts`     | HTTPS-only URL, redirect, and private-IP SSRF guard                  |
| `src/components/topbar.tsx`     | Shared navigation header and media-availability help popover         |
