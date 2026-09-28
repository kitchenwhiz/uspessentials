/**
 * USP Essentials – save order PDFs to Google Drive
 *
 * The website's server sends each order PDF here; this script saves it into
 * your Drive folder (one sub-folder per month, e.g. "2026-09") and returns the link.
 *
 * Setup (once, signed in to the Google account that should own the PDFs):
 *  1. In Google Drive, create a folder, e.g. "USP Essentials Orders". Open it and copy
 *     the folder ID from the address bar (the part after /folders/).
 *  2. Go to https://script.google.com → New project. Delete what's there, paste this
 *     whole file, and fill in FOLDER_ID and TOKEN below. TOKEN is any long random
 *     secret (30+ letters and numbers). Save.
 *  3. Deploy → New deployment → type "Web app".
 *       Execute as:    Me
 *       Who has access: Anyone
 *     Deploy, allow the permissions it asks for, and copy the Web app URL.
 *  4. In Cloudflare → Pages project → Settings → Variables and secrets, add
 *       DRIVE_SCRIPT_URL = the Web app URL
 *       DRIVE_TOKEN      = the same TOKEN (as a secret)
 *     for Production and Preview, then redeploy.
 *
 * The PDFs stay private to your Google account: the link opens for you (and anyone
 * you share the folder with), not for the public. Requests without the TOKEN are refused.
 */

const FOLDER_ID = 'PASTE_YOUR_DRIVE_FOLDER_ID_HERE';
const TOKEN = 'PASTE_A_LONG_RANDOM_SECRET_HERE';

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (!d || d.token !== TOKEN) return reply_({ ok: false, error: 'forbidden' });

    const name = String(d.name || 'order.pdf').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 150);
    const bytes = Utilities.base64Decode(String(d.base64 || ''));
    if (bytes.length < 5 || bytes.length > 3 * 1024 * 1024) return reply_({ ok: false, error: 'bad_pdf' });
    const head = String.fromCharCode.apply(null, bytes.slice(0, 5).map(function (b) { return b & 0xff; }));
    if (head !== '%PDF-') return reply_({ ok: false, error: 'bad_pdf' });

    const month = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM');
    const folder = monthFolder_(DriveApp.getFolderById(FOLDER_ID), month);
    const file = folder.createFile(Utilities.newBlob(bytes, 'application/pdf', name));
    if (d.description) file.setDescription(String(d.description).slice(0, 500));

    return reply_({ ok: true, id: file.getId(), url: file.getUrl() });
  } catch (err) {
    return reply_({ ok: false, error: 'server_error' });
  }
}

function monthFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
