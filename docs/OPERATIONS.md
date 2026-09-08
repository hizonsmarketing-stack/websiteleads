# Running it day to day

## The Leads menu

| Item | What it does |
| --- | --- |
| **Setup / repair tabs** | Creates anything missing and re-applies formatting. Safe on a live workbook; run it after adding an event type or a salesperson. |
| **Import bridal fair worksheet…** | See [BRIDAL_FAIRS.md](BRIDAL_FAIRS.md). |
| **Open team roster** | Jumps to `_Team`, where you say who covers what. |
| **Import existing leads from a tab…** | One-time, per salesperson tab. See [EXISTING_LEADS.md](EXISTING_LEADS.md). |
| **Set web app URL…** | Store the deployed address once, so the menu can print finished URLs. |
| **Show webhook URL** | The URLs to give Wix and Google Ads, ready to paste. |
| **Show last received payload** | Prints the most recent request exactly as it arrived. The first thing to check when a form submits but a field lands in the wrong place. |
| **Set webhook token…** | The shared secret website forms must send. |
| **Set Google Ads key…** | Must match the Key on the Google Ads lead form. |
| **Send lead digest now** | Sends the summary email immediately, whatever the count is at. Useful for testing the address list. |
| **Move selected lead to…** | Hands the lead on the selected row to another salesperson, or to a shared tab. Use this instead of copying rows between tabs. |
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
| `Notify On New Lead` | `no` | Email each caller once their tab has collected new leads |
| `Notify Every N Leads` | `5` | How many a tab collects first. `1` tells them about every lead |
| `Notify Unassigned To` | blank | Addresses told when a lead arrives with no event type. One mail per batch, independent of the row above |
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

### Choosing the order

`Assignment Order` in `_Settings`:

| Value | Behaviour |
| --- | --- |
| `balanced` *(default)* | Whoever has had the fewest leads gets the next one. |
| `roster` | Straight down the `_Team` tab and back to the top. |

**`roster` makes the rotation the roster itself** — the order is the order of
the rows, so moving a row moves that person's turn, with nothing else to edit.
Anyone who does not cover the lead's event type is stepped over rather than
waited for, so a corporate lead cannot stall the rotation on somebody who does
not take corporate.

Where the rotation stopped is remembered as a name, not a row number, so
inserting or reordering rows moves the rotation with them. `Last Assigned At`
cannot serve for this: it is written to the second, and several leads landing in
one second would leave the rotation unable to tell which came last.

Switching between the two is safe either way. The pointer is kept up to date in
both, so a switch carries on from the right person.

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

**Counting starts the first time it looks.** Switching the digest on does not
summarise the leads already on the sheet — on a workbook carrying migrated
history that would be thousands of rows and an email Gmail refuses to send.
The first *Send lead digest now* says so and sends nothing; run it again once
a new lead has arrived.

A digest lists at most 50 leads individually. The counts always cover
everything, and the mail says how many more are waiting on the sheet — a fair
worksheet landing hundreds at once should still produce a digest rather than
an error.

Three things it deliberately does not do:

- **A returning client is not a new lead.** A submission merged into a row
  someone is already working does not move the counter.
- **A bulk import sends one email, not five.** A fair worksheet with fifty
  leads crosses the threshold five times and still sends a single digest
  covering all fifty.
- **Importing your history never triggers it.** Migrating years of past leads
  would otherwise fire a digest for every ten of them.

### When a lead can't be routed

A lead whose event type couldn't be worked out goes to **Unassigned** with no
owner and no presenter — the one case where the automation has done all it can
and a person has to look. Waiting for someone to notice the tab is how a lead
goes cold, so put addresses in `Notify Unassigned To` and they are told at the
moment it happens.

The mail names the wording the form actually sent, which is the useful part:
it is what to add to a keyword list so the next lead like it routes itself.

```
Subject: [Unassigned lead] Vague Vera

A lead arrived without an event type, so nobody has been assigned to it:

Vague Vera
  wording on the form: "Something we do not recognise"
  from: Homepage Inquiry
  contact: vera@example.com
```

It follows the same two rules as the digest: **a returning client is not a new
problem**, so merges are silent, and **a bulk import sends one mail, not
forty** — a fair worksheet with twelve unroutable rows is one thing to look at.
It works whether or not `Notify On New Lead` is on, because wanting to hear
about routing failures is not the same as wanting a mail for every lead.

### Email alerts

Set `Notify On New Lead` to `yes` and each caller is told when their own tab
has collected leads — not one mail per lead. `Notify Every N Leads` sets how
many first; it ships as `5`, which is one mail to sit down to rather than five
interruptions across a morning. Set it to `1` to hear about every lead as it
lands.

```
Subject: [5 new leads] waiting on Bea

5 new leads are waiting on your Bea tab:

Maria Santos — Wedding
  event date: 2026-12-14   guests: 180
  contact: maria@example.com   0917 111 2233
  from: Homepage Inquiry   presenter: AJ
```

The count is per tab, so a caller who reaches five is told while everyone else
keeps accumulating. Nothing is lost below the threshold — those leads stay
counted and go out with the mail that crosses it.

`Notify - Wedding` and the rest still work: those addresses are copied in
alongside the caller, for whichever event types appear in the batch.

Two things it deliberately does not do:

- **A returning client is not a new lead**, so merged duplicates never trigger
  a mail — one person filling in three forms doesn't produce three alerts.
- **Switching it on doesn't mail anyone their back catalogue.** A tab starts
  counting from wherever it already is, not from row 2.

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
- `email,phone,name` — also matches on the client's name, squashed so `MARIA
  CRUZ` and `Maria  Cruz` are one person.

### When the row a repeat should merge into has gone

Someone deletes a row, or moves one between tabs by hand. The index still knows
the contact, but there is nothing left to merge into.

The lead is written back to **the same caller's tab**, keeping the lead id it
already had, and the index is pointed at the new row. It is never dealt out
again: the client is known, and re-running the rotation would hand them to a
second caller — the one thing the index exists to prevent. `_Log` records it as
`Indexed row is gone; re-filing with the same caller`, and the result is
reported as `refiled` rather than `created`.

A run of those warnings means rows are being deleted or moved by hand on that
tab. Use **Move selected lead to…** for hand-offs, and **Rebuild dedupe index**
after deleting rows.

### When the same client still reaches two callers

`email,phone` can only match on something the two submissions share. If one
form asks for an email and another asks for a phone, the same person filling in
both leaves no overlap at all — no key matches, so a second lead is created and
dealt to a different caller.

Two ways to close it, best first:

1. **Ask every form for both an email and a phone.** This removes the gap at
   source and cannot merge two different people by mistake.
2. **Add `name` to `Dedupe On`.** It catches what nothing else can, at the risk
   of merging two clients who happen to share a name — which is the worse
   failure, because a real lead then disappears into somebody else's row.

Name is deliberately checked *last*, so a genuine email or phone match always
wins and is reported as such in the **Matched On** column of the Duplicates tab.

**Changing `Dedupe On` needs a Rebuild dedupe index.** The keys are written when
a lead arrives, so leads already in the sheet carry no name key until the index
is rebuilt — until then, switching it on appears to do nothing.

## The weekly count

The Dashboard carries a **Leads by week** block for the current month, which
names itself from a formula — it reads correctly in November without anyone
re-running setup.

One row per week, one column per source, and a total:

| Leads by week | Website | Google Ads | Exhibit | All sources |
| --- | --- | --- | --- | --- |
| Week 1 (1-7) | | | | |
| Week 2 (8-14) | | | | |
| Week 3 (15-21) | | | | |
| Week 4 (22-31) | | | | |
| This month | | | | |

**All sources is counted, not added up.** It runs the same count with no source
filter, so a lead carrying a source outside the list still reaches the total —
and a row whose columns do not sum to it is telling you one arrived. Adding the
columns together would have hidden that.

The source columns follow `SOURCES` in `src/00_Config.gs`; add a source there
and the grid grows a column on the next **Setup / repair tabs**.

Calendar weeks would put a month across five or six rows starting on a
different day each month, which cannot be compared month to month. Days of the
month are steadier: the 1st to the 7th is always Week 1.

**Week 4 is ten days wide, not seven**, because the last bucket runs to 31 so a
long month has nowhere to hide. Expect it to read about a third higher than the
others; that is the bucket, not a surge.

Counted on **Received At** — when the lead arrived, not when anyone worked it —
from **All Leads**, which holds every lead exactly once. Repeat inquiries are
filed in the Duplicates tab, so a client who submits three times counts once.

To change the split, edit `WEEK_BUCKETS` in `src/10_Setup.gs` and run **Setup /
repair tabs**. Any number of buckets works; they need to cover the days you
care about without overlapping.

## Handing a lead to someone else

Click any cell on the lead's row, then **Leads → Move selected lead to…** and
type who gets it — a salesperson's name, or a shared event-type tab.

Use this rather than copying the row between tabs. A copy-paste looks right and
is not: four separate records have to change together, and a copy changes one.

| | Copy-paste by hand | Move selected lead to… |
| --- | --- | --- |
| The row | on both tabs unless you remember to delete the original | moved, once |
| Duplicate matching | still points at the old tab, so the client's next submission merges into a row nobody is working | follows the lead |
| **All Leads** | still names the old owner | corrected |
| Roster tallies | untouched, so the rotation feeds the receiver as though they were empty | receiver +1, sender −1 |

Everything the lead already carries comes with it — touches, first seen, the
message thread. It is the same lead in somebody else's hands, and the move is
appended to **Message** so the receiver can see where it came from. The whole
thing runs under the document lock, so a hand-off cannot land half-done.

Three things it decides for you:

- **The presenter is recomputed** for the row it lands on, because the rotation
  runs down the destination tab by row.
- **An Unassigned lead takes the receiver's event type**, but only when that
  person covers exactly one. Anyone covering several leaves it open — guessing
  would be worse than the caller finding out and saying so.
- **A lead marked `Transferred` arrives as `New`.** `Transferred` is what the
  sender wrote when they let go of it; to the receiver it is a lead nobody has
  worked yet.

It refuses to act on the header row, a row past the end of the tab, a tab that
holds no leads, an unknown destination, and a lead already on the tab you named.
A refusal moves nothing.

## Statuses

Five words, one per lead, picked from a dropdown on the **Status** column. They
are what the Dashboard's headline counts read.

- **New** — the lead landed and nobody has called it yet. The automation sets
  this on arrival.
- **Valid** — the client answered and has a real inquiry: someone worth
  quoting, not merely someone you reached.
- **No Response** — contact was tried three times and the client answered none
  of them.
- **Lost** — the client said no. They booked another caterer, or filled the
  form in by mistake. A service location too far to serve counts as a loss too.
- **Transferred** — handed to the presenter, or passed to another caller:
  socials to corporate and back, or over to the food-order team.

**Needs Contact Info** is written by the automation and never picked from the
dropdown: the form arrived with no email and no phone, so there is no way to
reach the person. The Dashboard counts it alongside the five so those leads
stay visible rather than sitting unnoticed in a tab.

### The row colours itself

Setting a status recolours the whole row, the instant the cell changes:

| Status | Row |
| --- | --- |
| New | white |
| Valid | green |
| No Response | blue |
| Lost | red |
| Transferred | purple |
| Duplicate | orange — only ever seen on the Duplicates tab |

`NR` colours blue along with `No Response`, and any other shorthand added to
`STATUS_ALIASES` colours with the status it belongs to. `Needs Contact Info`
has no colour of its own and keeps the sheet's banding.

New is white on purpose rather than left uncoloured: most rows are New at any
moment, so a plain ground is what makes the worked ones show up.

It is conditional formatting, written onto every tab someone works a lead in
plus Duplicates, so there is nothing to run and nothing to keep up to date. Not
**All Leads** — its Status is the automation's copy and does not follow a
caller's edit, so colouring it would dress a stale value up as a current one.

Change the colours in `STATUS_COLOURS` in `src/10_Setup.gs` and run **Setup /
repair tabs**. A re-run replaces the set rather than stacking another behind
it, and a conditional-format rule somebody set up for themselves is left alone
— those are applied first, so they still win.

### Shorthand

`NR` in the Status column counts as **No Response**. Matching is Sheets' own, so
`nr` and `Nr` count too. Shorthand is deliberately kept out of the dropdown —
one name per status there — and lives in `STATUS_ALIASES` in `src/10_Setup.gs`.
Adding another is one line.

### Change a status on the caller's own tab

The Dashboard counts every salesperson tab and every event-type tab, resolving
each tab's own Status column rather than assuming a position. It does *not*
count **All Leads**, which is the automation's own copy of every row: edits made
there are not carried back to the caller's tab, so a status typed into All Leads
changes nothing anybody sees.

### Renaming or adding one

Edit `STATUS_OPTIONS` in `src/10_Setup.gs`, push, then run **Setup / repair
tabs** — the dropdown on every lead tab and the Dashboard's own rows both read
from that one list.

Leads already carrying the old word keep it, because the dropdown permits values
outside the list on purpose, and they then count under nothing. After a rename,
find-and-replace the retired word across all sheets with *Match entire cell
contents* ticked.

## Troubleshooting

**A test submission landed on top of the previous one.**
That is deduplication doing its job. Two submissions carrying the same email or
phone are the same person, so the second is merged into the first: **Touches**
goes to 2, the new message is appended below the old one, and the row is filed
in the **Duplicates** tab. Existing values are never overwritten, so the event
type stays as the first submission set it.

To test several distinct leads, give each one a different email address —
`you+test1@gmail.com`, `you+test2@gmail.com` and so on will not work, because
plus-tags are deliberately treated as the same inbox. Use genuinely different
addresses, or set `Dedupe Ignore Plus Tags` to `no` while testing.

**A lead arrived named "field:full_name".**
The automation's body was saved with its tokens never substituted, so every
answer is its own field name. Such submissions are now skipped rather than
stored, and `_Log` says so. Fix the body in the automation.

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

**The Dashboard's status counts never move.**
They used to read **All Leads** only, which nobody edits. The counts now come
from the salesperson and event-type tabs, where callers actually work. If yours
still sit still, the deployment predates the fix: push, reload, then run
**Setup / repair tabs**, which is what rewrites the formulas. A count stuck at
zero while rows plainly say otherwise usually means those rows carry a retired
word — see [Statuses](#statuses).

**Source cells are still coloured.**
Colouring by source was tried and dropped. **Setup / repair tabs** removes the
rules it created, matching them by column and condition rather than by exact
range, so it still finds them on tabs that have grown since. Conditional
formatting you added by hand is left alone.

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
- A fair worksheet imports in chunks of 100, each its own batch so the dedupe
  index reaches the sheet as it goes. A few hundred rows finish in one
  execution; one too big stops cleanly, says how many are left, and the
  dialog's button becomes **Continue**.
- Inbound webhooks are serialised with a document lock, so two forms submitted
  at the same instant can't both create the same lead.
- `_Raw` and `_Log` self-trim to the retention settings above.
