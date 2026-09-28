/**
 * USP Essentials – save order PDFs to Google Drive
 *
 * The website's server sends each order PDF here; this script saves it into the
 * "UPS_ecoline_orders" folder of the Google account that runs it, one sub-folder per
 * month (e.g. "2026-09"), and returns the link. (If the folder can't be found it is
 * created in My Drive.)
 *
 * Setup (once, signed in as operations@kitchenwhiz.in):
 *  1. Go to https://script.google.com → New project. Delete what's there, paste this
 *     whole file, and set TOKEN below to a long random secret (30+ letters and
 *     numbers). Save.
 *     Then choose "setupCheck" in the toolbar and click Run once: allow the permissions;
 *     the log should show the UPS_ecoline_orders folder link.
 *  2. Deploy → New deployment → type "Web app".
 *       Execute as:    Me
 *       Who has access: Anyone
 *     (If "Anyone" isn't offered, the Google Workspace admin for kitchenwhiz.in must
 *     allow it: Admin console → Apps → Google Workspace → Drive and Docs / Apps Script
 *     sharing settings.)
 *     Deploy, allow the permissions it asks for, and copy the Web app URL.
 *  3. In Cloudflare → Pages project → Settings → Variables and secrets, add
 *       DRIVE_SCRIPT_URL = the Web app URL
 *       DRIVE_TOKEN      = the same TOKEN (as a secret)
 *     for Production and Preview, then redeploy.
 *
 * Each quote PDF is set to "Anyone with the link can view" so customers can open it;
 * the folder itself stays private. Requests without the TOKEN are refused.
 */

const ROOT_FOLDER_NAME = 'UPS_ecoline_orders';
// Optional: paste the folder ID (from its address bar, after /folders/) to pin the exact folder.
const ROOT_FOLDER_ID = '1Pmu-v75fnMa418YTtWWzNzuUQ9R2DCwA';
const TOKEN = 'PASTE_A_LONG_RANDOM_SECRET_HERE';

/**
 * Run this once from the editor (select "setupCheck" → Run) to grant permissions and
 * check it can reach the UPS_ecoline_orders folder. It logs the folder link.
 */
function setupCheck() {
  const f = rootFolder_();
  Logger.log('Orders folder ready: ' + f.getUrl());
}

/**
 * Run this from the editor (select "testUpload" → Run) to save a small test PDF the
 * same way the website does. The Execution log shows the result; delete the
 * "TEST - delete me.pdf" file from the folder afterwards.
 */
function testUpload() {
  const b64 = Utilities.base64Encode(Utilities.newBlob('%PDF-1.4\n% test file from testUpload\n%%EOF\n').getBytes());
  const res = doPost({ postData: { contents: JSON.stringify({ token: TOKEN, name: 'TEST - delete me.pdf', base64: b64, description: 'testUpload' }) } });
  Logger.log(res.getContent());
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (!d || d.token !== TOKEN) return reply_({ ok: false, error: 'forbidden' });

    const name = String(d.name || 'order.pdf').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 150);
    const b64 = String(d.base64 || '');
    // A PDF starts with "%PDF-", which is "JVBERi0" in base64
    if (b64.indexOf('JVBERi0') !== 0 || b64.length > 4 * 1024 * 1024) return reply_({ ok: false, error: 'bad_pdf' });
    const bytes = Utilities.base64Decode(b64);

    const month = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM');
    const folder = childFolder_(rootFolder_(), month);
    const file = folder.createFile(Utilities.newBlob(bytes, 'application/pdf', name));
    if (d.description) file.setDescription(String(d.description).slice(0, 500));
    // Quotes are shared with customers: anyone with the link can view this file (the folder stays private)
    let shared = true;
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { shared = false; }

    return reply_({ ok: true, id: file.getId(), url: file.getUrl(), shared: shared });
  } catch (err) {
    return reply_({ ok: false, error: 'server_error', detail: String((err && err.message) || err).slice(0, 150) });
  }
}

function rootFolder_() {
  if (ROOT_FOLDER_ID) return DriveApp.getFolderById(ROOT_FOLDER_ID);
  const found = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);   // anywhere in this account's Drive
  return found.hasNext() ? found.next() : DriveApp.getRootFolder().createFolder(ROOT_FOLDER_NAME);
}

function childFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
