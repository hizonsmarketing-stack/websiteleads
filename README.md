# Website Leads Automation

Automated lead distribution for the sales team. Every inquiry — on-page Wix
forms, Google Ads lead forms, and the worksheets bridal fair organisers send
after an exhibit — lands in one Google Sheet, deduplicated, tagged with its
source and sub-source, and filed in the team tab for its event type.

It runs as a Google Apps Script bound to the sales worksheet. There is no
server to host and nothing to pay for.

---

## What it does

```
  Wix on-page forms  ─┐
  Google Ads forms   ─┼──►  webhook  ─┐
                      │               │
  Bridal fair         │               ├──►  normalise  ──►  dedupe  ──►  route
  worksheet (.xlsx)  ─┴──►  import  ──┘         │             │            │
                                                │             │            ▼
                                       phone/email/date   email or    Corporate
                                       /name/event type   phone match    Wedding
                                        made consistent       │          Debut
                                                              │       Kid's Party
                                                              │      Private Event
                                                              ▼       Unassigned
                                                     merged into the
                                                     lead you already
                                                     have (+ Duplicates log)
```

- **Sorted by event type, then handed to a person.** The event type picks the
  team; the team's rotation picks who gets it, and the lead lands in that
  salesperson's own tab. Wording is matched, not just exact values: "Company
  Christmas Party" is corporate, "Church Wedding Reception" is a wedding, "18th
  Birthday" is a debut, "Kiddie Party" is a kid's party.
- **Shared out evenly.** Whoever covers that event type and has the fewest leads
  so far gets the next one, so the split is even and explainable. Ties break on
  who was assigned longest ago. A returning inquiry always goes back to the rep
  who already owns that lead, never into the rotation.
- **Duplicates removed.** Same email or same phone as an existing lead, from any
  channel, and the new submission is folded into the original: touch count goes
  up, blank fields are filled in, the new form is added to the lead's
  sub-source list, and the raw submission is filed in the **Duplicates** tab.
  Nothing is deleted.
- **Sources tagged.** Every row carries `Website`, `Google Ads` or `Exhibit`.
- **Sub-sources tagged.** The form name or the fair name. New ones register
  themselves in the **_Sources** tab the first time they appear — adding a form
  along the way means pointing it at the webhook with a new `&form=` value.
- **Nothing is dropped.** An inquiry with no recognisable event type goes to
  **Unassigned** rather than disappearing, and is moved to the right team tab
  automatically once a later submission says what the event is.

## Tabs it creates

| Tab | What lives there |
| --- | --- |
| `Dashboard` | Live counts by team, source, status and sub-source |
| One tab per salesperson | Where their leads land — your existing tabs, kept as they are |
| `Wedding`, `Debut`, `Kid's Party`, `Private Event`, `Corporate` | Fallback queues for event types nobody is rostered for |
| `Unassigned` | Leads whose event type is unknown, awaiting a human or a follow-up form |
| `All Leads` | Master log of every unique lead |
| `Duplicates` | Every repeat submission, with what it matched on and which lead it belongs to |
| `_Team` | The roster: who covers which event types, which tab is theirs, how many they've had |
| `_Settings` | Every knob: dedupe rules, notification addresses, retention |
| `_Sources` | The source / sub-source registry — where new forms show up |
| `_Index`, `_Raw`, `_Log` | Machinery: dedupe keys, raw payload archive, run log (hidden) |

## Getting started

1. **[docs/SETUP.md](docs/SETUP.md)** — install the script on the sales
   worksheet and deploy the webhook. Fifteen minutes, once.
2. **[docs/WIX.md](docs/WIX.md)** — point your Wix forms at it.
3. **[docs/GOOGLE_ADS.md](docs/GOOGLE_ADS.md)** — point your Google Ads lead
   forms at it.
4. **[docs/BRIDAL_FAIRS.md](docs/BRIDAL_FAIRS.md)** — import an organiser's
   worksheet after a fair.
4b. **[docs/EXISTING_LEADS.md](docs/EXISTING_LEADS.md)** — bring the leads
   already sitting in your salespeople's tabs into duplicate matching.
5. **[docs/OPERATIONS.md](docs/OPERATIONS.md)** — day-to-day: adding forms and
   event types, changing the dedupe rule, assigning reps, troubleshooting.
6. **[docs/FIELD_MAPPING.md](docs/FIELD_MAPPING.md)** — how unfamiliar column
   names are understood, and how to teach it new ones.

## Repository layout

```
src/
  00_Config.gs      Event types, column schema, field aliases — the tuning knobs
  01_Util.gs        Settings, logging, locking, payload flattening
  02_Sheets.gs      Tab and header plumbing; read/write rows by column name
  03_Normalize.gs   Phone, email, name, date, guest count, event-type matching
  04_Mapping.gs     Unknown payload -> canonical lead; the _Sources registry
  05_Dedupe.gs      The dedupe index and duplicate detection
  06_Router.gs      Team-tab routing, round-robin assignment, duplicate merging
  07_Intake.gs      The single pipeline every lead passes through
  08_WebApp.gs      doPost/doGet — the webhook Wix and Google Ads call
  09_FairImport.gs  Bridal fair worksheet reader
  10_Setup.gs       Creates and repairs the workbook
  11_Menu.gs        The Leads menu
  12_Tests.gs       Self-test, runnable from the menu
  13_Migrate.gs     One-time import of leads already in a salesperson's tab
  FairImport.html   The bridal fair import dialog
  Migrate.html      The existing-leads import dialog
  appsscript.json   Manifest (scopes, timezone, web-app config)
dist/             Generated by `npm run bundle` — src/*.gs as one Code.gs,
                  for pasting into the Apps Script editor by hand
test/
  run.js            Whole automation under Node, against a fake Sheets service
  fakes.js          The in-memory stand-in for SpreadsheetApp and friends
tools/
  bundle.js         Builds dist/
```

## Developing

Changes can be tested locally, with no Google account and no live spreadsheet:

```bash
npm test
```

This runs the pure-logic self-test plus end-to-end scenarios — a website form,
a Google Ads lead that duplicates it by phone, an Unassigned lead being
promoted after a second submission, a fair worksheet with title rows above the
headers, a seven-person roster splitting leads evenly across two teams,
migrating a salesperson tab that already had leads in it, and webhook token
rejection — asserting on what actually lands in each tab.

After changing anything in `src/`, rebuild the single-file install bundle:

```bash
npm run bundle
```

To push changes to the live script:

```bash
npm install                 # first time only
npx clasp login             # first time only
cp .clasp.json.example .clasp.json   # then paste in your script ID
npm run push
```

After pushing changes that affect the webhook, redeploy: see
[docs/SETUP.md](docs/SETUP.md#updating-the-script-later).
