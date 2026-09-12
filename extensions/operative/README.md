# Relay first-party operative (Chrome MV3)

Owner: Seth. Implementation: #177. Unpacked Chromium extension; not a Chrome
Web Store listing, Autopilot path, or real ATS adapter.

This is the recommended execution surface for the Inspect send handshake on a
**fictional HTTPS fixture form**. Relay still does not POST the employer form.
Same-tab `window.relay` / WebMCP remains for hosts that cannot load the
extension.

## Load unpacked

1. Sign into Relay in Chromium (Cloudflare Access on a deployed host, or the
   local development identity).
2. Open `chrome://extensions`, enable Developer mode, **Load unpacked**, and
   choose this directory (`extensions/operative`).
3. Open the fictional fixture form in another tab. Click the extension action.
4. Choose the signed-in Relay tab, the fixture tab, and a complete Full
   name. **Start operative** requests host permission for any HTTPS Relay
   or fixture origin that was not granted at install (user gesture, before
   any `await`), then loads jobs. Choose a job if the list was empty, then
   Start again. The second Start after grant does not prompt. The operative
   probes for **Submit fictional application**, then opens a run tab. Keep
   that tab open.
5. In the signed-in workspace, **Accept and send** while the payload is armed.
   The operative begins once, clicks **Submit fictional application** once, and
   records the observed receipt. Closing the run tab aborts wait and does not
   submit.

Local development origins (`http://127.0.0.1`, `http://localhost`) are granted
at install. `tabs` lists HTTPS Relay and fixture tabs; `activeTab` covers the
tab that opened the action. Deployed HTTPS Relay and fixture origins are
requested on Start (user gesture, before any `await`). The service worker is a
mailbox: it does not `fetch` Relay APIs and does not use `chrome.cookies`.
Those calls run in the signed-in Relay page with `credentials: 'same-origin'`.
A `chrome-extension://` mutation is 403.

## Limits

- Isolated fill inspects the tab URL against the armed destination and the
  **Submit fictional application** control **before** writing any field. A
  Greenhouse, Lever, or other real form is not a fixture; the operative does
  not start.
- One execute permit; never retry `executing`; a no-op submit is `uncertain`.
  An error at or after the Submit click stays `uncertain`, not `not-submitted`.
  Terminal `complete`/`uncertain` writes that Relay refuses or cannot save are
  not reported as saved and are not retried. The run tab still shows the
  observed receipt, the recording error, and that Relay did not save the
  record. Receipts require the fixture confirmation marker, not a pre-submit
  heading.
- Overlay `/apply` still has no Accept. Policy authorization is not draft
  acceptance. #111 revocable agent credentials are unchanged.
- Do not export session cookies, add service-token access, or inject the Relay
  session into the fixture origin.
