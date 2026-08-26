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

**No contact detail is rewritten.** Names, emails and phone numbers stay
exactly as they were typed, because those are what your team reads and dials.
Matching happens on tidied copies held in the hidden `_Index` tab, never in the
sheet.

Every other column is filled **only where it is empty**. A row with a Status of
`Quoted` keeps it; a row with no status gets `New`.

### Your columns are used, not duplicated

A tab that has been in use for years doesn't use the automation's column names,
and it doesn't have to. Any column that means the same thing is used as it is:

| Your column | Used as |
| --- | --- |
| `Contact number` | Phone |
| `Event` | Event Type |
| `Guests` | Guest Count |
| `Venue` | Venue / Location |
| `TIMESTAMP` | Received At |
| `Full name`, `Email`, `Event Date`, `SOURCE`, `SUB-SOURCE`, `PRESENTER` | themselves |

No second column appears beside any of these, and new leads arriving from the
website fill the columns your team already reads. Only fields your tab genuinely
lacks — Lead ID, Message, Status, Touches and so on — are added on the right.

Notes columns are the exception: a tab can have several (`SALES NOTES`,
`CLIENT NOTES`, `CONTACT METHOD`), so writing to one of them would overwrite
another. They keep their historical values, and a new **Message** column carries
what arrives from here on.

### Presenters

A tab that already has a **PRESENTER** column keeps every value in it — those
were real assignments and the migration does not second-guess them. The
repeating sequence only governs leads that arrive from here on, continuing down
the tab from whatever row the new ones land on. On a corporate caller's tab
there is no sequence at all — new leads there name the caller as presenter.

### Dates — the one value that can change

Several people have typed into these columns over the years, so the import
reads each date on its own merits rather than assuming one format. This is the
only rewriting the migration does, and
`Normalise Event Dates On Import` in `_Settings` turns it off entirely:

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
   - **where each of your columns ends up**:

     | Preview says | Meaning |
     | --- | --- |
     | `Guest Count — stays in this column` | Your `Guests` column *is* the guest count. No second column appears; new leads fill yours |
     | `Message — new column` | A column is added for it, because a tab can have several notes columns and there is no single right one to write to |
     | `kept in the notes` | Not a field the automation knows, so its values go into **Message** rather than being dropped |
     | `(ignored)` | Dropped entirely — webhook plumbing, or a column you've asked it to skip |

   - **how many rows match a lead somewhere else** — the same person already
     sitting in another rep's tab

   Most of your columns should say *stays in this column*. That is the
   automation using your sheet's own vocabulary rather than duplicating it.

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

## Big tabs

Google gives a script six minutes per run. A tab with more rows than that
allows **stops cleanly rather than being killed**, and says so:

> Stopped after 1,200 to stay inside Google's time limit — 900 row(s) still to
> go. Run the import again on this tab to carry on; rows already done are
> skipped.

Run it again and it picks up where it left off. Nothing is left half-written:
rows are processed in blocks, and a block is either written whole or not at
all. `Import Time Budget (seconds)` in `_Settings` controls when it stops —
lower it if runs are being killed anyway, but 240 leaves comfortable headroom.

If you ever see Google's own *"Exceeded maximum execution time"* error rather
than the message above, the budget has been set too high; put it back to 240.

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
