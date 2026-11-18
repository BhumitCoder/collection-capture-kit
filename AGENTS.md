# Studio Vault Engineering Guidelines

- Keep image inspection and metadata removal strictly local to the browser so source photos never leave the user's device or pass through any server.
- Keep local image auditing (`/inspect`) separate from storefront collection exports (`/`).
- All server-side storefront and media proxy routes (`/api/shopify`, `/api/media`) must enforce HTTPS-only public host validation and SSRF protection.
