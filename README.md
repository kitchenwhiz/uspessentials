# USP Essentials – online store

Static website for USP Essentials stainless steel work tables, shelves, racks, grease traps and drain gratings.

## What's here

| Path | What it is |
| --- | --- |
| `index.html` | The whole site: products, price list, cart and WhatsApp/email ordering. |
| `img/` | 3D product photos from the USP Essentials catalogues, one per product or table variant. |
| `functions/api/send-order.js` | Cloudflare Pages Function: saves the order PDF to Google Drive, emails the order (details + PDF) to USP Essentials and, if asked, a copy to the customer. |
| `drive/save-order-pdf.gs` | Google Apps Script that saves order PDFs into a Drive folder (paste into script.google.com; setup steps inside). |

No build step. Edit `index.html`, commit and push, and Cloudflare redeploys automatically.

Prices and product data are in the `<script>` block of `index.html`
(`TABLE_PRICES`, `RACKS`, `MS_RACKS`, `GTRAPS`, `GRATINGS`).
The WhatsApp number and email are `WA_NUMBER` and `EMAIL` in the same block.

## Deploy (Cloudflare)

Connect this repository to Cloudflare. Build command: none. Output directory: `/` (repository root).

## Order emails (Send order by email)

The site builds an order PDF and posts it to `/api/send-order`, which sends it through
[Resend](https://resend.com). Set these in Cloudflare → Pages project → Settings →
Variables and secrets (Production and Preview), then redeploy:

| Name | Value |
| --- | --- |
| `RESEND_API_KEY` | API key from Resend (add as a **secret**) |
| `MAIL_FROM` | Sender, e.g. `USP Essentials <orders@yourdomain.in>`; the domain must be verified in Resend |
| `ORDER_TO` | Where order emails go, e.g. `uspecoline@kitchenwhiz.in` (defaults to `uspecoline@gmail.com`) |

Until these are set, "Send order by email" falls back to saving the PDF and opening the
customer's email app with the order filled in.

## Order PDFs in Google Drive

Every order (WhatsApp or email) saves its PDF to the **uspecoline orders** folder in the
Google Drive of tradelinkscorporation@gmail.com, in monthly sub-folders, named like `USP-260928-155105 - Name - Project.pdf`. The Drive link goes
in the WhatsApp summary and in the order email to USP Essentials (not in the customer's copy).

1. Signed in as tradelinkscorporation@gmail.com, follow the steps at the top of
   `drive/save-order-pdf.gs` (paste the script at script.google.com, set TOKEN, run
   `setupCheck` once, deploy as a Web app: Execute as *Me*, access *Anyone*).
2. In Cloudflare → Pages project → Settings → Variables and secrets add
   `DRIVE_SCRIPT_URL` (the Web app URL) and `DRIVE_TOKEN` (the script's TOKEN, as a secret).

The PDFs stay private to that Google account; requests without the token are refused.
