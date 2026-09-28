// Cloudflare Pages Function: GET /api/health
// Shows whether order email and Google Drive saving are set up, and tests that the
// Drive script accepts this site's token. No file is saved and no secret is shown.

export async function onRequestGet({ env }) {
  const email = !!(env.RESEND_API_KEY && env.MAIL_FROM);
  const out = { email: email ? "configured" : "not configured", drive: "not configured" };
  if (env.DRIVE_SCRIPT_URL && env.DRIVE_TOKEN) {
    try {
      // An empty PDF: the script checks the token first, then rejects the file,
      // so "bad_pdf" means the token was accepted and nothing was saved.
      const r = await fetch(env.DRIVE_SCRIPT_URL, {
        method: "POST", headers: { "Content-Type": "application/json" }, redirect: "follow",
        body: JSON.stringify({ token: env.DRIVE_TOKEN, name: "health-check.pdf", base64: "" }),
      });
      const raw = await r.text();
      let j = null; try { j = JSON.parse(raw); } catch {}
      out.drive = !j ? `script did not return JSON (HTTP ${r.status})`
        : j.error === "bad_pdf" ? "working (token accepted)"
        : j.error === "forbidden" ? "token does not match the script"
        : `script error: ${String(j.error || "unknown").slice(0, 40)}`;
    } catch { out.drive = "script unreachable"; }
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
