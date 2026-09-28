# USP Essentials – online store

Static website for USP Essentials stainless steel work tables, shelves, racks, grease traps and drain gratings.

## What's here

| Path | What it is |
| --- | --- |
| `index.html` | **The live site.** One self-contained file with the product photos built in. This is what Cloudflare serves. |
| `src/index.html` | The editable version of the same page. Photos are loaded from `src/img/`. |
| `src/img/` | 3D product photos taken from the USP Essentials catalogues (one per product or table variant). |
| `build.py` | Bundles `src/index.html` + `src/img/` into the root `index.html`. |

## Making changes

1. Edit `src/index.html` (open it in a browser to check it).
2. Run `python3 build.py` to regenerate `index.html`.
3. Commit both files and push. Cloudflare redeploys automatically.

Prices and product data are in the `<script>` block of `src/index.html`
(`TABLE_PRICES`, `OHS_PRICES`, `RACKS`, `MS_RACKS`, `GTRAPS`, `GRATINGS`).
The WhatsApp number and email are `WA_NUMBER` and `EMAIL` in the same block.

## Deploy (Cloudflare)

Connect this repository to Cloudflare. Build command: none. Output directory: `/` (repository root).
