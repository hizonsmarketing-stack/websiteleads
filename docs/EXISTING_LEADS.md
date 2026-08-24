# Bringing in leads you already have

Your salespeople's tabs already hold leads from before the automation existed.
Those rows are invisible to duplicate matching until they've been imported —
which means a client who inquired last month and inquires again next week would
be treated as brand new, and dealt to whoever's turn it is rather than going
back to the rep who's been working them.

This is a one-time job, one tab at a time.

## What it does and doesn't do

**Rows stay exactly where they are.** Nothing moves between tabs, nothing is
deleted, and whoever owns a lead keeps it. The migration adds the automation's
columns to the right of your existing ones and fills them in from what the row
already says.

The only values it overwrites are **Email** and **Phone**, rewritten in
normalised form (`0917 123 4567` → `+639171234567`) so they can be matched
across sources. The original phone text is preserved in **Phone (Raw)**, and
your own legacy columns are left untouched — if you have a "Contact" column,
it keeps its original contents.

Every other column is filled **only where it is empty**. A row with a Status of
`Quoted` keeps it; a row with no status gets `New`. If your tab already has a
column the automation also uses — `Email`, `Venue`, `Event Date`, `SOURCE`,
`SUB-SOURCE` — that column is reused rather than duplicated, and the values in
it win over anything chosen in the dialog.

### Dates

Several people have typed into these columns over the years, so the import
reads each date on its own merits rather than assuming one format:

| Written as | Read as | Why |
| --- | --- | --- |
| `03/15/2027` | `2027-03-15` | There is no 15th month, so it can only be March 15th |
| `15/03/2027` | `2027-03-15` | Same date, written the other way round — still only one reading |
| `06/06/2027` | `2027-06-06` | The sixth of June whichever way it was meant |
| `2027-03-15`, `March 15, 2027` | `2027-03-15` | Already unambiguous |
| **`03/04/2027`** | **left exactly as typed** | March 4th or April 3rd — guessing would move a real booking by weeks |

The original is always kept in a new **Event Date (Raw)** column, the same way
the original phone text is kept in **Phone (Raw)**.

Dates that can't be settled are **listed in the preview and the import summary**,
by row number and client name, so you can check them against the actual booking
and correct them by hand. They also stand out visually — they're the ones still
in slash format among the normalised rows.

## Doing it

1. **Leads → Import existing leads from a tab…**
2. Pick the tab. Set:

   | Field | What to put |
   | --- | --- |
   | **Owner for rows with no owner** | Defaults to the tab name, which is usually right |
   | **Event type when the row doesn't say** | Only used for rows with no recognisable event type of their own |
   | **Source to tag these with** | `Website` unless you know better — it's what most historical leads were |
   | **Sub-source** | `Pre-automation` by default. Anything you'd want to filter on later |

3. Click **Preview**. Nothing is written. You get:
   - which row it treated as the header, and how many data rows it found
   - how each of your columns was interpreted (`Client Name → Full Name`,
     `Contact → Phone`, `Remarks → Message`). Columns it doesn't recognise show
     as `(notes)` and their values go into the **Message** column
   - **how many rows match a lead somewhere else** — the same person already
     sitting in another rep's tab

4. If the column mapping looks wrong, fix it before importing: see
   [FIELD_MAPPING.md](FIELD_MAPPING.md#teaching-it-a-new-column-name).

5. Click **Import**.

6. Repeat for each salesperson's tab.

## Duplicates between reps

If Rosa Lim is in two reps' tabs, the migration **doesn't pick a winner** —
that's a commission question, not a software one. Both rows stay put, and the
match is logged in the **Duplicates** tab with what it matched on and where the
other copy is. Sort that tab and work through it with the reps involved.

The row is still indexed under whichever contact details are unique to it, so
future inquiries are matched to one of them rather than creating a third copy.

## Re-running it

Safe. Rows that already have a **Lead ID** are skipped, and the summary reports
them as *already imported*. So if you add rows to a tab by hand later, just run
the import on that tab again to pull them in.

## Afterwards

Once every tab is imported:

1. **Leads → Rebuild dedupe index** — confirms the index matches what's actually
   in the tabs.
2. Check the **Dashboard** — *Leads by salesperson* should roughly match what
   each rep expects to see.
3. Optionally delete your old legacy columns (the "Client Name" that's now
   duplicated by "Full Name"). The automation only writes to its own columns,
   so removing yours is safe once you're confident the data came across.
