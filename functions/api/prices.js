// Cloudflare Pages Function: GET /api/prices
//
// Since 28 Oct 2026 the prices come from the Kitchen Whiz Quote Builder (one price list for every program):
// a service binding named PRICES to the "uspquote" Worker (Pages project → Settings → Bindings → Service binding).
// The quote builder answers GET /api/feed/prices?for=shop with the list prices of USP Essentials and USP Ecoline.
// The Google price sheet below is only used while the binding is not set up.
//
// Reads the USP Essentials price sheet (a Google Sheet published as CSV) and returns
// { ok, prices: { "<EQ code>": <price excl. GST>, ... }, count }.
// The site applies these over the prices built into the page, so updating the sheet
// updates the site (within about 2 minutes) without changing any code.
//
// Setting (Cloudflare → Pages project → Settings → Variables and secrets):
//   PRICE_SHEET_URL   the sheet's "Publish to web" CSV link
//                     (File → Share → Publish to web → Prices sheet → CSV)

const CACHE_SECONDS = 120;
const json = (body, status = 200, maxAge = 0) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": maxAge ? `public, max-age=${maxAge}` : "no-store" },
  });

// Minimal CSV parser (handles quotes, commas and newlines inside quotes)
function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const FEED_CACHE_SECONDS = 60;
async function fromQuoteBuilder(env) {
  const r = await env.PRICES.fetch("https://uspquote.internal/api/feed/prices?for=shop");
  if (!r.ok) return null;
  const d = await r.json();
  if (!d || !d.ok || !d.prices) return null;
  const prices = {};
  for (const [code, price] of Object.entries(d.prices)) if (price > 0 && price < 10_000_000) prices[code] = Math.round(price);
  return { ok: true, prices, count: Object.keys(prices).length, source: "quote-builder", at: d.at };
}

export async function onRequestGet(ctx) {
  const { env } = ctx;
  if (env.PRICES) {
    try {
      const d = await fromQuoteBuilder(env);
      if (d) return json(d, 200, FEED_CACHE_SECONDS);
    } catch {}
    if (!env.PRICE_SHEET_URL) return json({ ok: false, error: "quote_builder_unreachable" }, 502);
  }
  return fromSheet(ctx);
}

async function fromSheet({ request, env, waitUntil }) {
  if (!env.PRICE_SHEET_URL) return json({ ok: false, error: "not_configured" }, 503);

  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/prices?cached=1", request.url).toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let text;
  try {
    const r = await fetch(env.PRICE_SHEET_URL, { redirect: "follow" });
    if (!r.ok) return json({ ok: false, error: `sheet_http_${r.status}` }, 502);
    text = await r.text();
  } catch { return json({ ok: false, error: "sheet_unreachable" }, 502); }

  const rows = parseCsv(text);
  // Find the header row: needs an "EQ Code" column and a "Price" column
  const norm = (s) => String(s || "").trim().toLowerCase();
  let hi = -1, codeCol = -1, priceCol = -1;
  for (let i = 0; i < Math.min(rows.length, 20) && hi < 0; i++) {
    const cells = rows[i].map(norm);
    const c = cells.findIndex((x) => x === "eq code" || x === "code" || x === "sku");
    const p = cells.findIndex((x) => x.startsWith("price"));
    if (c >= 0 && p >= 0) { hi = i; codeCol = c; priceCol = p; }
  }
  if (hi < 0) return json({ ok: false, error: "no_header" }, 502);

  const prices = {};
  for (const r of rows.slice(hi + 1)) {
    const code = String(r[codeCol] || "").trim().toUpperCase();
    const price = Number(String(r[priceCol] || "").replace(/[^\d.]/g, ""));
    if (/^[A-Z0-9]{2,12}$/.test(code) && price > 0 && price < 10_000_000) prices[code] = Math.round(price);
  }

  const res = json({ ok: true, prices, count: Object.keys(prices).length, source: "sheet" }, 200, CACHE_SECONDS);
  waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
