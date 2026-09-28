# USP Essentials – online store

Static website for USP Essentials stainless steel work tables, shelves, racks, grease traps and drain gratings.

## What's here

| Path | What it is |
| --- | --- |
| `index.html` | The whole site: products, price list, cart and WhatsApp/email ordering. |
| `img/` | 3D product photos from the USP Essentials catalogues, one per product or table variant. |

No build step. Edit `index.html`, commit and push, and Cloudflare redeploys automatically.

Prices and product data are in the `<script>` block of `index.html`
(`TABLE_PRICES`, `OHS_PRICES`, `RACKS`, `MS_RACKS`, `GTRAPS`, `GRATINGS`).
The WhatsApp number and email are `WA_NUMBER` and `EMAIL` in the same block.

## Deploy (Cloudflare)

Connect this repository to Cloudflare. Build command: none. Output directory: `/` (repository root).
