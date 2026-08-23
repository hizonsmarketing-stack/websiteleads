# Running it day to day

## The Leads menu

| Item | What it does |
| --- | --- |
| **Setup / repair tabs** | Creates anything missing and re-applies formatting. Safe on a live workbook; run it after adding an event type. |
| **Import bridal fair worksheet…** | See [BRIDAL_FAIRS.md](BRIDAL_FAIRS.md). |
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
| `Round Robin Assignment` | `no` | Fill **Assigned To** from the Reps list for each tab |
| `Notify On New Lead` | `no` | Email the addresses in the Notify rows |
| `Raw Payload Retention (rows)` | `2000` | How much of `_Raw` to keep |
| `Log Retention (rows)` | `5000` | How much of `_Log` to keep |
| `Reps - <Tab>` | blank | Comma-separated names, rotated in order |
| `Notify - <Tab>` | blank | Comma-separated email addresses |

### Assigning leads to reps

Set `Round Robin Assignment` to `yes` and fill in, say,
`Reps - Corporate` = `Ana, Ben, Cara`. New corporate leads then get **Assigned
To** filled in, rotating through the list. The rotation position survives
across submissions.

A lead that arrives with an owner already on it (a worksheet column called
"Assigned To") keeps that owner.

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
