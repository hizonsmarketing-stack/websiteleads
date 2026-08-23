# Setup

One-time installation. Budget about fifteen minutes.

## 1. Put the code on the sales worksheet

The script lives inside the Google Sheet the sales team already works in.

1. Open the sales worksheet in Google Sheets.
2. **Extensions → Apps Script**. An editor opens with an empty `Code.gs`.
3. Copy each file from `src/` into the editor as a file of the same name
   (the `+` next to *Files* → *Script* for `.gs` files, → *HTML* for
   `FairImport.html`). Delete the empty `Code.gs`.
4. Click the gear (*Project Settings*) and tick **Show "appsscript.json"
   manifest file in editor**, then paste in the contents of
   `src/appsscript.json`.
5. **Save**.

The script must be **bound to the spreadsheet** (created via *Extensions → Apps
Script* from inside it). If you instead created a standalone script project,
add a script property `SPREADSHEET_ID` with the sales worksheet's id — the part
of its URL between `/d/` and `/edit` — under *Project Settings → Script
Properties*.

Prefer the command line? Use [clasp](https://github.com/google/clasp) instead:

```bash
npm install
npx clasp login
# Script ID is in Apps Script > Project Settings
cp .clasp.json.example .clasp.json   # paste the script ID into it
npm run push
```

## 2. Create the tabs

Reload the spreadsheet. A **Leads** menu appears next to *Help*.

**Leads → Setup / repair tabs.**

Google will ask you to authorise the script the first time. It is your own
script, so the "unverified app" warning is expected: *Advanced → Go to
Website Leads Automation (unsafe)*. The scopes it asks for are in
`appsscript.json` — the spreadsheet, outbound requests, and sending mail for
new-lead notifications.

When it finishes you have the team tabs, `All Leads`, `Duplicates`,
`_Settings`, `_Sources`, a `Dashboard`, and the hidden machinery tabs.

This menu item is safe to run again at any time — it repairs missing tabs and
columns without touching existing data. Run it after adding a new event type.

## 3. Deploy the webhook

The website and Google Ads forms post to a URL, and that URL only exists once
the script is deployed.

1. In the Apps Script editor: **Deploy → New deployment**.
2. Gear icon → **Web app**.
3. Set:
   - **Description**: `leads webhook`
   - **Execute as**: **Me**
   - **Who has access**: **Anyone**
4. **Deploy**, authorise if asked, and copy the **Web app URL**. It looks like
   `https://script.google.com/macros/s/AKfy…/exec`.

"Who has access: Anyone" is what lets Wix and Google servers reach it. It is
not a hole in your data: the endpoint only accepts lead submissions, and step 4
locks it behind a shared secret.

You can always get the URL back from **Leads → Show webhook URL**.

## 4. Set the secrets

**Leads → Set webhook token…** — invent a long random string (a password
manager's generator is ideal). Every website form must send it as `&token=…`.
Requests without it are rejected and logged.

**Leads → Set Google Ads key…** — set this after you create the Google Ads lead
form webhook in [docs/GOOGLE_ADS.md](GOOGLE_ADS.md); it must match the **Key**
you type there. Google Ads authenticates with this rather than the token.

Until each secret is set, the matching requests are accepted with a warning in
the `_Log` tab, so you can test a form before locking it down. Don't leave it
that way.

## 5. Connect your sources

- [Wix on-page forms](WIX.md)
- [Google Ads lead forms](GOOGLE_ADS.md)
- [Bridal fair worksheets](BRIDAL_FAIRS.md) — nothing to connect; it's a menu
  item.

## 6. Check it works

Visit the web app URL in a browser. You should see:

```json
{"status":"ok","service":"Website Leads Automation", ...}
```

Then **Leads → Run self-test**, which exercises the phone/email/date
normalisation, the event-type matching and the payload parsing without writing
any leads.

Finally, submit a real test inquiry through one website form and confirm it
lands in the right team tab.

## Updating the script later

Editing the code is not enough for the webhook — Apps Script serves the version
that was deployed.

**Deploy → Manage deployments → (your deployment) → pencil icon → Version: New
version → Deploy.**

This keeps the same URL, so the forms need no changes. Creating a *new
deployment* instead would give you a *new URL* and the forms would keep posting
to the old code.

Changes that only affect the menu, the fair import or the routing rules take
effect as soon as you save — no redeployment needed.
