# Setup

One-time installation. Budget about fifteen minutes.

## 1. Put the code on the sales worksheet

The script lives inside the Google Sheet the sales team already works in.

1. Open the sales worksheet in Google Sheets.
2. **Extensions → Apps Script**. An editor opens with an empty `Code.gs`.
3. Select everything in `Code.gs` and replace it with the contents of
   **`dist/Code.gs`** from this repository. (That one file is every file in
   `src/` concatenated — Apps Script joins them at runtime anyway.)
4. Add the two dialogs. For each, click **+** next to *Files* → **HTML**, give
   it the exact name below (the editor adds the `.html` itself), and replace
   its contents:
   - `FairImport` ← **`dist/FairImport.html`**
   - `Migrate` ← **`dist/Migrate.html`**

   The names matter — the dialogs are loaded by them.
5. Click the gear (*Project Settings*) and tick **Show "appsscript.json"
   manifest file in editor**. Back in *Editor*, open `appsscript.json` and
   replace it with **`dist/appsscript.json`**.
6. Rename the project (click *Untitled project* at the top) to
   `Website Leads Automation`, and **Save**.

The script must be **bound to the spreadsheet** — created via *Extensions →
Apps Script* from inside it, as above. If you instead made a standalone script
project, add a script property `SPREADSHEET_ID` with the sales worksheet's id
(the part of its URL between `/d/` and `/edit`) under *Project Settings →
Script Properties*.

Prefer the command line? Use [clasp](https://github.com/google/clasp) instead,
which pushes the individual `src/` files:

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

When it finishes you have the shared event-type tabs, `All Leads`,
`Duplicates`, `_Settings`, `_Sources`, `_Team`, a `Dashboard`, and the hidden
machinery tabs. Setup also reports any existing tabs it thinks are
salespeople's.

This menu item is safe to run again at any time — it repairs missing tabs and
columns without touching existing data. Run it after adding a new event type.

## 2b. Fill in the team roster

Leads are handed to a person, not just to a team, so the automation needs to
know who covers what.

1. **Leads → Open team roster** (or open the `_Team` tab).
2. Setup has already listed every tab that isn't one of its own — one row per
   salesperson. For each:
   - **Event Types** — comma-separated, spelled exactly as the labels:
     `Wedding`, `Debut`, `Kid's Party`, `Private Event`, `Corporate`.
     Someone covering three of them gets all three, comma separated. `*` means
     everything.
   - **Email** — optional, for new-lead alerts.
   - **Active** — `yes` for anyone currently taking leads.
3. Leave **Assigned Count** and **Last Assigned At** alone — that's the
   rotation's memory.

4. **Leads → Run self-test.** It reads the roster back and reports who covers
   what, or names anything wrong with it — a misspelled event type is otherwise
   invisible, and silently drops that person from the rotation.

Anyone left inactive, or an event type nobody covers, falls back to the shared
event-type tab with no owner. Nothing is ever lost because the roster is
incomplete.

## 2c. Import the leads you already have

If your salespeople's tabs already hold leads, import them now so they take
part in duplicate matching — otherwise a client who inquired last month will be
treated as a new lead and dealt to whoever's turn it is.

**Leads → Import existing leads from a tab…**, once per tab. There is a preview
that writes nothing, and rows never move or get deleted. Full walkthrough in
[EXISTING_LEADS.md](EXISTING_LEADS.md).

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
