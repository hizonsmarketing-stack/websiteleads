# Running it day to day

## The Leads menu

| Item | What it does |
| --- | --- |
| **Setup / repair tabs** | Creates anything missing and re-applies formatting. Safe on a live workbook; run it after adding an event type. |
| **Import bridal fair worksheet…** | See [BRIDAL_FAIRS.md](BRIDAL_FAIRS.md). |
| **Open team roster** | Jumps to `_Team`, where you say who covers what. |
| **Import existing leads from a tab…** | One-time, per salesperson tab. See [EXISTING_LEADS.md](EXISTING_LEADS.md). |
| **Show webhook URL** | The URLs to give Wix and Google Ads. |
| **Set webhook token…** | The shared secret website forms must send. |
| **Set Google Ads key…** | Must match the Key on the Google Ads lead form. |
| **Rebuild dedupe index** | Re-reads every team tab and rebuilds the matching index. Run it after bulk-editing, deleting or moving rows by hand. |
| **Run self-test** | Checks the normalisation and routing logic. Writes nothing. |

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
| **Event Types** | Comma-separated, e.g. `Social / Debut / Birthday, Wedding, Private Event`. `*` means everything |
| **Email** | Optional. Gets the new-lead alert when notifications are on |
| **Active** | `yes` for anyone currently taking leads. Set to `no` for leave, and the rotation skips them |
| **Assigned Count**, **Last Assigned At** | Maintained automatically — this is the rotation's memory |
| **Notes** | Yours |

Setup pre-fills this with every tab in the workbook that the automation doesn't
own, inactive and with no event types, so nothing routes to a person until
you've said who covers what.

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

**A lead went to the wrong person.**
Check `_Team`: are their **Event Types** spelled exactly as the event type
labels, and is **Active** set to `yes`? A misspelled event type silently
excludes that person from the rotation. **Leads → Run self-test** doesn't check
the roster, but the Dashboard's *Leads by salesperson* block shows at a glance
if someone is getting nothing.

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

- A fair worksheet of a few hundred rows imports in one execution. A worksheet
  of several thousand rows may hit the 6-minute limit; split it in half and
  import twice — the second half will simply merge anything already loaded.
- Inbound webhooks are serialised with a document lock, so two forms submitted
  at the same instant can't both create the same lead.
- `_Raw` and `_Log` self-trim to the retention settings above.
