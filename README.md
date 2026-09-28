# USP Essentials – online store

Static website: a single self-contained HTML file (product photos are embedded). No build step.

- `index.html` – the whole site (products, 3D photos, price list, cart, WhatsApp/email ordering)

## Deploy (Cloudflare)
Connect this repository to Cloudflare. Build command: none. Output directory: `/` (repository root).

## Editing
Prices and product data are in the `<script>` block in `index.html`
(`TABLE_PRICES`, `OHS_PRICES`, `RACKS`, `MS_RACKS`, `GTRAPS`, `GRATINGS`).
WhatsApp number and email are `WA_NUMBER` and `EMAIL` in the same block.
