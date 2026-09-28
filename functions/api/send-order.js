// Cloudflare Pages Function: POST /api/send-order
//
// For each order it:
//   1. saves the order PDF to a Google Drive folder (through a Google Apps Script web app),
//   2. emails the order (details in the body, PDF attached, Drive link) to USP Essentials,
//   3. optionally emails a copy to the customer.
// and returns the Drive link so the site can put it in the WhatsApp message.
//
// Settings (Cloudflare → Pages project → Settings → Variables and secrets):
//   RESEND_API_KEY    (secret)  API key from resend.com
//   MAIL_FROM                   e.g.  USP Essentials <orders@yourdomain.in>   (domain verified in Resend)
//   ORDER_TO          optional  where orders go; defaults to uspecoline@gmail.com
//   DRIVE_SCRIPT_URL            Web app URL of the Apps Script in drive/save-order-pdf.gs
//   DRIVE_TOKEN       (secret)  The same secret written in that script
//
// Email and Drive are independent: either can be set up first. If neither is set up
// this returns 503 and the site falls back to the customer attaching the PDF themselves.

const DEFAULT_TO = "uspecoline@gmail.com"; // override with the ORDER_TO setting
const GST_RATE = 0.18;
const MAX_PDF_BASE64 = 2_000_000; // ~1.5 MB PDF
const MAX_ITEMS = 60;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clean = (s, max = 200) => String(s ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const emailOk = (e) => e.length <= 254 && /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/.test(e);

export async function onRequestPost({ request, env }) {
  // Only accept requests from this site's own pages
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ ok: false, error: "forbidden" }, 403);

  const emailOn = !!(env.RESEND_API_KEY && env.MAIL_FROM);
  const driveOn = !!(env.DRIVE_SCRIPT_URL && env.DRIVE_TOKEN);
  if (!emailOn && !driveOn) return json({ ok: false, error: "not_configured" }, 503);

  let d;
  try { d = await request.json(); } catch { return json({ ok: false, error: "bad_request" }, 400); }

  // ---- validate ----
  const c = d.customer || {};
  const cust = {
    name: clean(c.name, 80), biz: clean(c.biz, 120), project: clean(c.project, 120),
    phone: clean(c.phone, 20), city: clean(c.city, 80), gst: clean(c.gst, 20),
    note: clean(c.note, 500), email: clean(c.email, 254),
  };
  const ref = /^USP-\d{6}-\d{4}(\d{2})?$/.test(d.ref || "") ? d.ref : "USP-order";
  const viaWhatsApp = d.source === "whatsapp";
  const wantCopy = !!d.copy;
  // Only the phone number is collected. WhatsApp orders may come without it (the
  // number shows in WhatsApp); email orders need it.
  const phoneDigits = cust.phone.replace(/[^\d+]/g, "");
  if (!viaWhatsApp && cust.phone.replace(/\D/g, "").length < 10) return json({ ok: false, error: "missing_fields" }, 400);
  if (wantCopy && !emailOk(cust.email)) return json({ ok: false, error: "bad_email" }, 400);
  if (cust.email && !emailOk(cust.email)) cust.email = "";

  if (!Array.isArray(d.items) || !d.items.length || d.items.length > MAX_ITEMS) return json({ ok: false, error: "bad_items" }, 400);
  const items = [];
  for (const it of d.items) {
    const code = String(it.code || "");
    const qty = Number(it.qty), rate = Number(it.rate);
    if (!/^[A-Z0-9]{2,12}$/.test(code) || !Number.isInteger(qty) || qty < 1 || qty > 999 || !(rate > 0 && rate < 10_000_000))
      return json({ ok: false, error: "bad_items" }, 400);
    items.push({ code, name: clean(it.name, 120), size: clean(it.size, 60), qty, rate, amount: rate * qty });
  }
  // Totals are recomputed here, not taken from the browser
  const sub = items.reduce((a, i) => a + i.amount, 0);
  const gst = Math.round(sub * GST_RATE);
  const total = sub + gst;
  const units = items.reduce((a, i) => a + i.qty, 0);

  const pdfB64 = String(d.pdf?.base64 || "");
  const pdfName = /^Order-USP-\d{6}-\d{4}(\d{2})?\.pdf$/.test(d.pdf?.name || "") ? d.pdf.name : `Order-${ref}.pdf`;
  if (!pdfB64 || pdfB64.length > MAX_PDF_BASE64 || !/^[A-Za-z0-9+/]+=*$/.test(pdfB64)) return json({ ok: false, error: "bad_pdf" }, 400);
  try { if (!atob(pdfB64.slice(0, 8)).startsWith("%PDF")) return json({ ok: false, error: "bad_pdf" }, 400); }
  catch { return json({ ok: false, error: "bad_pdf" }, 400); }

  // ---- 1. save the PDF to Google Drive ----
  let driveUrl = "", driveError = "";
  if (driveOn) {
    // File name: order number + phone, e.g. "USP-260928-173300 - 9886672354.pdf"
    const driveName = `${ref}${phoneDigits ? ` - ${phoneDigits}` : ""}.pdf`;
    try {
      const r = await fetch(env.DRIVE_SCRIPT_URL, {
        method: "POST", headers: { "Content-Type": "application/json" }, redirect: "follow",
        body: JSON.stringify({
          token: env.DRIVE_TOKEN, name: driveName, base64: pdfB64,
          description: `Order ${ref} | ${inr(total)} | Qty ${units}${cust.phone ? ` | ${cust.phone}` : ""}`,
        }),
      });
      const raw = await r.text();
      let j = null; try { j = JSON.parse(raw); } catch { driveError = `not_json_${r.status}`; }
      if (j && j.ok && /^https:\/\/(drive|docs)\.google\.com\//.test(j.url || "")) driveUrl = j.url;
      else if (j) driveError = (String(j.error || "unknown") + (j.detail ? ": " + j.detail : "")).slice(0, 160);
    } catch (e) { driveError = "unreachable"; }
  }

  // ---- compose ----
  // Subject: order number, total, quantity, name, project
  const subject = `Order ${ref} | ${inr(total)} | Qty ${units}${cust.phone ? ` | ${cust.phone}` : ""}`;
  const detailRows = [
    ["Order ref", ref], ["Name", cust.name], ["Business", cust.biz], ["Project", cust.project],
    ["Phone", cust.phone], ["Email", cust.email], ["Delivery city", cust.city], ["GSTIN", cust.gst],
  ].filter(([, v]) => v);

  const html = (intro, forOwner) => `<!doctype html><html><body style="margin:0;background:#EEF1F3;font-family:Arial,Helvetica,sans-serif;color:#14171A">
<div style="max-width:640px;margin:0 auto;background:#fff">
  <div style="background:#000;padding:18px 24px"><div style="color:#F2C063;font-size:22px;font-weight:bold">USP Essentials</div>
  <div style="color:#C9CED2;font-size:13px">Order ${esc(ref)}</div></div>
  <div style="padding:20px 24px">
    <p style="margin:0 0 16px;font-size:15px">${intro}</p>
    <table style="border-collapse:collapse;font-size:14px;margin-bottom:18px">${detailRows
      .map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;color:#58626A">${esc(k)}</td><td style="padding:3px 0">${esc(v)}</td></tr>`).join("")}</table>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <tr style="background:#EEF1F3"><th align="left" style="padding:8px">Code</th><th align="left" style="padding:8px">Item</th><th align="right" style="padding:8px">Qty</th><th align="right" style="padding:8px">Rate</th><th align="right" style="padding:8px">Amount</th></tr>
      ${items.map((i) => `<tr><td style="padding:8px;border-bottom:1px solid #CDD3D8;white-space:nowrap"><b>${esc(i.code)}</b></td><td style="padding:8px;border-bottom:1px solid #CDD3D8">${esc(i.name)}${i.size ? `<br><span style="color:#58626A">${esc(i.size)} mm</span>` : ""}</td><td align="right" style="padding:8px;border-bottom:1px solid #CDD3D8">${i.qty}</td><td align="right" style="padding:8px;border-bottom:1px solid #CDD3D8;white-space:nowrap">${inr(i.rate)}</td><td align="right" style="padding:8px;border-bottom:1px solid #CDD3D8;white-space:nowrap">${inr(i.amount)}</td></tr>`).join("")}
      <tr><td colspan="4" align="right" style="padding:8px 8px 2px">Subtotal (${units} ${units === 1 ? "item" : "items"})</td><td align="right" style="padding:8px 8px 2px">${inr(sub)}</td></tr>
      <tr><td colspan="4" align="right" style="padding:2px 8px">GST at 18%</td><td align="right" style="padding:2px 8px">${inr(gst)}</td></tr>
      <tr><td colspan="4" align="right" style="padding:6px 8px;font-size:16px"><b>Total</b></td><td align="right" style="padding:6px 8px;font-size:16px;white-space:nowrap"><b>${inr(total)}</b></td></tr>
    </table>
    ${cust.note ? `<p style="margin:16px 0 0;font-size:14px"><b>Notes:</b> ${esc(cust.note)}</p>` : ""}
    ${forOwner && driveUrl ? `<p style="margin:16px 0 0;font-size:14px"><b>PDF in Google Drive:</b> <a href="${esc(driveUrl)}">${esc(driveUrl)}</a></p>` : ""}
    <p style="margin:16px 0 0;font-size:13px;color:#58626A">The order PDF is attached. Prices exclude shipping, unloading and installation. We confirm stock within 24 working hours and share payment details; processing starts after 100% advance payment.</p>
  </div>
  <div style="padding:14px 24px;background:#000;color:#8C949A;font-size:12px">USP Essentials, 235/E Bommasandra Industrial Area, Phase 3, Bengaluru 560099 · +91 99020 14700 · uspecoline@gmail.com</div>
</div></body></html>`;

  const text = (intro, forOwner) => [
    intro, "",
    ...detailRows.map(([k, v]) => `${k}: ${v}`), "",
    "Items:",
    ...items.map((i) => `${i.code} (${i.name}${i.size ? `, ${i.size} mm` : ""}) x ${i.qty} = ${inr(i.amount)}`), "",
    `Subtotal (excl. GST): ${inr(sub)}`, `GST 18%: ${inr(gst)}`, `Total: ${inr(total)}`,
    cust.note ? `\nNotes: ${cust.note}` : "",
    "", "The order PDF is attached.",
    forOwner && driveUrl ? `PDF in Google Drive: ${driveUrl}` : "",
  ].join("\n");

  const attachments = [{ filename: pdfName, content: pdfB64 }];
  const ownerTo = env.ORDER_TO || DEFAULT_TO;

  const sendMail = (payload) =>
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

  // ---- 2. email USP Essentials (reply goes to the customer if they gave an email) ----
  let emailed = false;
  if (emailOn) {
    const ownerRes = await sendMail({
      from: env.MAIL_FROM, to: [ownerTo], subject,
      ...(cust.email ? { reply_to: cust.email } : {}),
      html: html(`New order ${esc(ref)}${cust.phone ? ` from <b>${esc(cust.phone)}</b>` : ""}.${viaWhatsApp ? " The customer is also sending a summary on WhatsApp." : ""}`, true),
      text: text(`New order ${ref}${cust.phone ? ` from ${cust.phone}` : ""}.${viaWhatsApp ? " The customer is also sending a summary on WhatsApp." : ""}`, true),
      attachments,
    });
    emailed = ownerRes.ok;
  }
  if (!emailed && !driveUrl) return json({ ok: false, error: "send_failed", drive: driveOn ? (driveError || "no_link") : "off", email: emailOn ? "failed" : "off" }, 502);

  // ---- 3. optional copy to the customer (reply goes to USP Essentials) ----
  let copied = false;
  if (wantCopy && emailOn) {
    const copyRes = await sendMail({
      from: env.MAIL_FROM, to: [cust.email], subject, reply_to: ownerTo,
      html: html(`Thank you, ${esc(cust.name)}. This is a copy of the order you sent to USP Essentials.`),
      text: text(`Thank you, ${cust.name}. This is a copy of the order you sent to USP Essentials.`),
      attachments,
    });
    copied = copyRes.ok;
  }

  return json({ ok: true, ref, total, emailed, driveUrl, copied, ...(driveError ? { driveError } : {}) });
}
