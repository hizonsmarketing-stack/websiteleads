# Running it day to day

## The Leads menu

| Item | What it does |
| --- | --- |
| **Setup / repair tabs** | Creates anything missing and re-applies formatting. Safe on a live workbook; run it after adding an event type. |
| **Import bridal fair worksheet…** | See [BRIDAL_FAIRS.md](BRIDAL_FAIRS.md). |
| **Open team roster** | Jumps to `_Team`, where you say who covers what. |
| **Import existing leads from a tab…** | One-time, per salesperson tab. See [EXISTING_LEADS.md](EXISTING_LEADS.md). |
| **Set web app URL…** | Store the deployed address once, so the menu can print finished URLs. |
| **Show webhook URL** | The URLs to give Wix and Google Ads, ready to paste. |
| **Show last received payload** | Prints the most recent request exactly as it arrived. The first thing to check when a form submits but a field lands in the wrong place. |
| **Set webhook token…** | The shared secret website forms must send. |
| **Set Google Ads key…** | Must match the Key on the Google Ads lead form. |
| **Send lead digest now** | Sends the summary email immediately, whatever the count is at. Useful for testing the address list. |
| **Rebuild dedupe index** | Re-reads every team tab and rebuilds the matching index. Run it after bulk-editing, deleting or moving rows by hand. |
| **Run self-test** | Checks the normalisation and routing logic, then checks the `_Team` roster for misspelled event types, active people covering nothing, two people sharing a tab, and event types nobody covers. Writes nothing. |

## Adding a new website form

Point it at the webhook with a new `form=` value —
`…/exec?source=website&form=Valentines%20Promo&token=…`. That's the whole
procedure. The form registers itself in `_Sources` on its first submission.

Details in [WIX.md](WIX.md).

## Adding an event type or team tab

1. Open `src/00_Config.gs` and add an entry to `EVENT_TYPES`:

   ```js
   {
     key: 'government',
     label: 'Government',
     tab: 'Government',
     keywords: ['government', 'lgu', 'city hall', 'barangay', 'dpwh', 'public sector']
   }
   ```

   `tab` is the sheet name; `label` is what's written in the Event Type column.

2. Save (or `npm run push`).
3. **Leads → Setup / repair tabs** to create the tab and its settings rows.

Order matters only for ties: when two types match keywords of identical length,
the one listed first wins. Put the more specific type higher.

## Presenters

The first column of every caller's tab is **Presenter**. How it is filled
depends on the event type.

### Everything except corporate

A fixed repeating sequence runs down the tab:

| Row | Presenter |
| --- | --- |
| 2 | AJ |
| 3 | Pam |
| 4 | Mhay |
| 5 | Vanessa |
| 6 | AJ — and round again |

The caller works the lead and hands it to whoever their row names, so the split
is settled by the sheet rather than negotiated lead by lead. Each tab runs its
own sequence, so every caller's first lead goes to AJ, their second to Pam.

### Corporate

Corporate is called and presented by the same two people, so the sequence does
not apply — the caller presents their own. A corporate lead in Shane's tab
shows **Shane** as presenter; one in Abi's tab shows **Abi**.

### Changing any of it

| Setting | Value | Meaning |
| --- | --- | --- |
| `Presenters` | `AJ, Pam, Mhay, Vanessa` | The default sequence, in rotation order |
| `Presenters - Corporate` | `caller` | The caller presents their own |
| `Presenters - Wedding` (and the rest) | blank | Follow the `Presenters` row above |
| any of them | `Shane, Abi` | That sequence, for that event type only |
| any of them | `none` | No presenter on those leads |

So a fifth presenter joins by adding a name to `Presenters`; a type gets its
own bench by listing names on its own row; and a type where the caller does
both is set to `caller`.

**Leads → Run self-test** reports the arrangement back, which is the quickest
way to confirm it is what you meant:

```
OK — Wedding: called by Bea, Carlo, Dina, Fred, presented by AJ → Pam → Mhay → Vanessa
OK — Corporate: called by Shane, Abi, presented by the caller
```

### Two consequences worth knowing

- **The sequence follows the row, not the lead.** Sorting or filtering a tab
  moves each row's presenter with it, because the name is written into the cell
  rather than calculated. Nobody is reassigned by a sort.
- **Totals per presenter won't be exactly equal**, because every tab starts its
  own cycle at AJ. If one caller gets far more leads than another, the
  presenters at the top of the list see more of them. Reorder the `Presenters`
  list periodically if that matters.

A lead sitting in a shared event-type tab or in **Unassigned** has no presenter
yet — it has no caller either. It gets one at the moment it reaches a caller's
tab.

## Settings

All in the `_Settings` tab. Changes take effect on the next submission.

| Setting | Default | What it does |
| --- | --- | --- |
| `Time Zone` | `Asia/Manila` | Every timestamp the automation writes |
| `Default Country Code` | `63` | Local numbers starting `09…` become `+639…` |
| `Dedupe On` | `email,phone` | Which keys make a duplicate. `email,phone,date` also matches on contact + event date; `email` alone is loosest |
| `Dedupe Ignore Plus Tags` | `yes` | `maria+expo@gmail.com` matches `maria@gmail.com` |
| `Promote Unassigned Leads` | `yes` | Move a lead out of Unassigned when a later form reveals its event type |
| `Append Duplicate Notes` | `yes` | Add the repeat inquiry's text to the original lead's Message |
| `Accept Test Leads` | `no` | Store Google Ads test leads instead of only acknowledging them |
| `Round Robin Assignment` | `yes` | Share leads out across the `_Team` roster. `no` sends everything to the shared event-type tabs instead |
| `Presenters` | `AJ, Pam, Mhay, Vanessa` | The default sequence down the Presenter column, in order |
| `Presenters - <Event Type>` | blank, or `caller`, or a list | Overrides the default for that event type. Corporate ships as `caller` |
| `Notify On New Lead` | `no` | Email the addresses in the Notify rows |
| `Raw Payload Retention (rows)` | `2000` | How much of `_Raw` to keep |
| `Log Retention (rows)` | `5000` | How much of `_Log` to keep |
| `Notify - <Tab>` | blank | Extra addresses copied on new leads of that event type, on top of the assignee |

## The team roster

`_Team` is who gets what. One row per salesperson:

| Column | Use |
| --- | --- |
| **Salesperson** | Their name, written into **Assigned To** on each lead |
| **Tab Name** | The tab their leads land in. Defaults to their name |
| **Event Types** | Comma-separated, e.g. `Wedding, Debut, Kid's Party, Private Event`. `*` means everything |
| **Email** | Optional. Gets the new-lead alert when notifications are on |
| **Active** | `yes` for anyone currently taking leads. Set to `no` for leave, and the rotation skips them |
| **Assigned Count**, **Last Assigned At** | Maintained automatically — this is the rotation's memory |
| **Notes** | Yours |

Setup pre-fills this with every tab in the workbook that the automation doesn't
own, inactive and with no event types, so nothing routes to a person until
you've said who covers what. On a spreadsheet that starts empty there is
nothing to detect: type the roster instead, and running **Setup / repair tabs**
again gives everyone marked active a tab. Tabs that already exist are never
restyled — a team's own layout is left alone.

Adding a salesperson later is the same move: a row on `_Team`, then
**Setup / repair tabs**. When you've filled it in, run **Leads → Run
self-test** — it reads the roster back and tells you if anything is misspelled
or uncovered.

### How the split works

Among everyone active who covers that event type, **the one with the fewest
leads so far gets the next one**. Ties go to whoever was assigned longest ago,
then alphabetically. That produces the same strict rotation as taking turns,
but stays correct when you add someone, put someone on leave, or have one
person covering three event types.

To restart the rotation — a new quarter, a new hire who should catch up — clear
the **Assigned Count** column.

Two things deliberately bypass the rotation:

- **A returning lead goes back to whoever owns it.** Deduplication merges the
  new submission into the existing row, wherever it lives, so a rep never loses
  a lead they've been working because the client filled in a second form.
- **A lead that names an owner keeps them.** If an imported worksheet has an
  "Assigned To" column with a name on the roster, that person gets it.

### When nobody covers an event type

The lead goes to the shared event-type tab (`Corporate`, `Wedding`, …) with
**Assigned To** blank, for a manager to hand out. That's also what happens if
you set `Round Robin Assignment` to `no`.

Leads whose event type couldn't be worked out go to **Unassigned** with no
owner — and are assigned automatically if a later submission reveals the event
type.

## The digest

Every ten new leads, the team gets one email summarising what came in and where
it went — no need to open the sheet to know how the week is going.

```
Subject: 10 new leads — Wedding 3, Corporate 2, Debut 2, Kid's Party 2, Private Event 1

By event type:  Wedding 3, Corporate 2, Debut 2, Kid's Party 2, Private Event 1
By caller:      Bea 4, Carlo 4, Abi 1, Shane 1
By source:      Website 10

Maria Santos · Wedding · event 2026-12-14 · caller Bea · presenter AJ · 0917 111 2233 …
```

Set `Digest Recipients` in `_Settings` to switch it on, and `Digest Every N
Leads` to change the interval — `0` turns it off. **Leads → Send lead digest
now** sends one immediately, which is how to check the addresses work.

Three things it deliberately does not do:

- **A returning client is not a new lead.** A submission merged into a row
  someone is already working does not move the counter.
- **A bulk import sends one email, not five.** A fair worksheet with fifty
  leads crosses the threshold five times and still sends a single digest
  covering all fifty.
- **Importing your history never triggers it.** Migrating years of past leads
  would otherwise fire a digest for every ten of them.

### Email alerts

Set `Notify On New Lead` to `yes` and fill in `Notify - Wedding` etc. with the
addresses to alert. Only new leads trigger a mail — merged duplicates don't, so
one person filling in three forms doesn't produce three alerts.

Mail is sent from the account that deployed the script and counts against that
account's daily Gmail quota.

## Sub-sources

The `_Sources` tab is the registry. Every form and fair appears here the first
time it sends a lead.

| Column | Use |
| --- | --- |
| **Source** | Website / Google Ads / Exhibit |
| **Sub-Source (as received)** | The raw identifier. **Don't edit this** — it's the matching key |
| **Display Name** | What appears on lead rows. Edit freely |
| **Default Event Type** | Routes leads from this form when the form has no event-type question |
| **Active**, **Notes** | For your own bookkeeping |
| **First Seen**, **Last Seen**, **Lead Count** | Maintained automatically |

## Duplicates

A repeat inquiry never creates a second row on a team tab. Instead the original
lead gets:

- **Touches** +1, and **Last Touch At** updated
- any blank contact or event field filled in from the new submission
- the new form added to **All Sub-Sources** (`Homepage Inquiry | Wedding Expo Manila 2026`)
- the new message appended to **Message**, dated and attributed

and the submission itself is filed in the **Duplicates** tab with **Matched On**
(Email or Phone) and the lead it belongs to.

To review what's being caught, sort the Duplicates tab by **Received At**.

### Changing the rule

`Dedupe On` in `_Settings`:

- `email,phone` *(default)* — either one matching is a duplicate. Catches the
  most.
- `email,phone,date` — also treats contact + event date as a key. Use if
  clients legitimately book multiple separate events.
- `email` — loosest; misses people who give a phone but a different email.

## Troubleshooting

**A lead didn't arrive.**
Check `_Log` (unhide it: right-click any tab → *Show all tabs*, or **Setup /
repair tabs** which hides them again afterwards). Every request is logged,
including rejections. `invalid token` or `invalid google_key` means the secret
doesn't match; `no contact details` means the payload had no name, email or
phone.

**A lead went to the wrong person, or someone is getting nothing.**
Run **Leads → Run self-test**. It reads the roster and names the problem — a
misspelled event type, someone active with nothing to cover, two people writing
to one tab, or an event type nobody active handles. A clean roster reports who
covers what:

```
OK — 7 active of 8 on the roster.
OK — Wedding: Bea, Carlo, Dina, Fred, Iris
OK — Corporate: Gina, Hector
```

**A lead went to the wrong tab.**
Look at **Event Type (Raw)** on the row — that's the wording the form sent. Add
that wording to the right type's keyword list
([FIELD_MAPPING.md](FIELD_MAPPING.md#how-event-types-are-decided)), then move
the row by hand and run **Rebuild dedupe index**.

**A field ended up in Message instead of its own column.**
The header wasn't recognised. Add it to the alias list
([FIELD_MAPPING.md](FIELD_MAPPING.md#teaching-it-a-new-column-name)).

**Duplicates are getting through.**
Usually different email *and* different phone — check both rows. If someone
deleted or reordered rows by hand, run **Rebuild dedupe index**.

**Two people share one row.**
Family members sometimes share a phone number. Split the row by hand and run
**Rebuild dedupe index**. If it's a recurring problem, switch `Dedupe On` to
`email`.

**The webhook returns an error in the browser.**
A `GET` to the URL should return `{"status":"ok",…}`. If you get Google's
sign-in page, the deployment's *Who has access* isn't set to **Anyone**.

**Changes to the code didn't take effect.**
For webhook behaviour you must redeploy the existing deployment as a new
version — see [SETUP.md](SETUP.md#updating-the-script-later). Menu, import and
routing changes take effect on save.

## Scale and limits

Apps Script gives a consumer Google account roughly 20,000 URL-fetch-free
executions and 6 minutes per execution — far beyond typical lead volume. The
things to know:

- Importing an existing tab reads and writes a block of rows at a time, about
  1.3 Sheets calls per row. A tab of a few thousand rows is fine; one bigger
  than the six-minute limit allows stops cleanly, says how many are left, and
  resumes when run again.
- A fair worksheet of a few hundred rows imports in one execution.
- Inbound webhooks are serialised with a document lock, so two forms submitted
  at the same instant can't both create the same lead.
- `_Raw` and `_Log` self-trim to the retention settings above.
