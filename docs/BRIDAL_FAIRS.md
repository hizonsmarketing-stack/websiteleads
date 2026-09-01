# Importing bridal fair worksheets

After an exhibit, the organiser sends a spreadsheet of everyone who visited the
booth. The importer reads it whatever shape it arrives in, tags every row as an
**Exhibit** lead with the fair as its sub-source, and pushes it through the same
pipeline as website and ad leads — so someone who filled in your website form
last month and visited your booth this month stays **one** lead.

## Import it

1. If the organiser sent an `.xlsx` or `.csv`: upload it to Google Drive, open
   it, and use **File → Save as Google Sheets**. (You can also paste the rows
   into a new tab in the sales worksheet.)
2. In the sales worksheet: **Leads → Import bridal fair worksheet…**
3. Fill in the dialog:

   | Field | What to put |
   | --- | --- |
   | **Fair name** | Required. Becomes the sub-source on every lead, e.g. `Wedding Expo Manila 2026`. Include the year — you'll exhibit at the same fair again. |
   | **Organiser's Google Sheets link** | Paste the link to their file. Leave blank if you pasted the rows into a tab in this workbook. |
   | **Tab to read** | Which tab in that file. Blank uses the first one. |
   | **Event type when the sheet doesn't say** | Defaults to `Wedding`. Rows with their own event-type column override it. |
   | **Fair date** | Optional. Used as each lead's received date, so the timeline reflects the fair rather than the day you did the import. |
   | **Header row** | Optional. Leave blank — the importer finds the header row itself, even under a couple of title rows. |

4. Click **Preview** first. It reports which row it treated as the header, how
   many data rows it found, and how each column was interpreted:

   ```
   Name           → Full Name
   Contact No.    → Phone
   Email Address  → Email
   Wedding Date   → Event Date
   Booth Staff    → (notes)
   ```

   `(notes)` means the column isn't a field the automation knows — its values
   are kept in the lead's **Message** column rather than dropped. If something
   important reads `(notes)`, see
   [FIELD_MAPPING.md](FIELD_MAPPING.md#teaching-it-a-new-column-name).

5. Click **Import**. You get a count of new leads, merged duplicates and skipped
   rows, and where they were routed.

## What happens to each row

- **New contact** → a new lead, handed to the next salesperson in the rotation
  for its event type and placed in their tab.
- **Already in the system** (same email or phone as any existing lead) → merged
  into the original: touch count goes up, blanks are filled in, the fair is
  added to the lead's sub-source list, and the row is filed in **Duplicates**.
  The rep keeps working the lead they already have.
- **Name but no email or phone** → still imported, with status **Needs Contact
  Info**, so it's visible rather than lost.
- **Completely blank row** → skipped.

## A worksheet too big for one run

Apps Script stops any script at six minutes. Rather than being killed partway,
the import works in chunks of 100 rows and keeps an eye on the clock: when the
time budget is spent it stops between chunks and reports how many rows are
left. The dialog's **Import** button becomes **Continue** — press it and the
import carries on from the row it stopped at.

Each chunk is its own batch, which means the dedupe index reaches the sheet as
the import goes rather than all at the end. Two things follow:

- **Carrying on cannot import a row twice.** Continue resumes at the next
  unread row.
- **Starting over cannot either.** If you lose track and run the whole
  worksheet again, every lead already imported is recognised on email or phone
  and merged into the row that exists — the counts come back as merges, not new
  leads. This is the safety net if a run is interrupted some other way, such as
  closing the dialog or losing the connection.

Changing any field in the dialog clears the resume point, because it only means
anything for the import that produced it. If you edit the fair name or point at
a different sheet, the button goes back to **Import** and starts from the top.

The budget is `Import Time Budget (seconds)` in `_Settings`, 240 by default.
Apps Script kills a run at 360, so leave headroom.

## Notes from experience

- **Import once.** Re-importing the same worksheet is safe — every row will
  match itself and merge — but it inflates touch counts and fills the
  Duplicates tab. If you must re-import (the organiser sent a corrected file),
  it costs you nothing but noise.
- **Two phone columns** are common ("Contact No." twice, for mobile and
  landline). Both are kept; the first is used for matching.
- **A fair that isn't bridal** — a corporate expo, a food festival — works the
  same way. Set *Event type when the sheet doesn't say* accordingly.
- **The default event type is remembered.** The first import registers the fair
  in `_Sources` along with that default, so a second import of the same fair
  behaves consistently.
