# Connecting Google Ads lead forms

Google Ads lead form extensions (and lead form assets) can push each submission
straight to the webhook, so ad leads are deduplicated against website and
exhibit leads instead of sitting in a separate CSV.

## Set up the webhook in Google Ads

1. Open the lead form asset: **Ads & assets → Assets → Lead form**, then edit it.
2. Scroll to **Lead delivery option** and expand **Webhook integration**.
3. Fill in:
   - **Webhook URL**:
     `https://script.google.com/macros/s/AKfy…/exec?source=googleads`
   - **Key**: a long random string you invent. This is Google's way of proving a
     request really came from them.
4. Click **Send test data**. It should report success.
5. Save the form.

## Tell the script the key

**Leads → Set Google Ads key…** in the spreadsheet, and paste in the exact same
**Key**. Submissions whose `google_key` doesn't match are rejected and logged in
`_Log`.

Note the difference from website forms: Google Ads authenticates with the key
*inside the payload*, so the URL does **not** need `&token=`.

## Test leads

When you click **Send test data**, Google sends a payload flagged `is_test`.
The script acknowledges it — so Google reports success — but does not create a
lead, keeping fake names off the sales tabs. The acknowledgement is recorded in
`_Log`.

To capture test leads as real ones while debugging, set **Accept Test Leads**
to `yes` in `_Settings`. Set it back afterwards.

## Sub-sources

Each lead form gets its own sub-source, taken from the Google form id, e.g.
`Google Ads Form 4242`. Give it a readable name once and it sticks:

1. Open the `_Sources` tab.
2. Find the row for `Google Ads Form 4242`.
3. Change **Display Name** to something like `Search — Corporate Catering`.

New leads from that form then arrive with the friendly name. The **Sub-Source
(as received)** column is what the matching runs on, so leave it alone.

You can also set a **Default Event Type** on that row — useful when a lead form
sits under a campaign that only ever sells one kind of event, and the form
itself has no event-type question.

## Getting event type out of a lead form

Google's built-in fields are contact details only. Add a **custom question** to
the lead form so leads route themselves:

> **What type of event are you planning?**
> Wedding · Corporate · Debut or Birthday · Private Event

The question text arrives as the field name and is matched the same way a Wix
field would be, so the answer routes the lead. Without it, ad leads land in
**Unassigned** unless the campaign has a **Default Event Type** set in
`_Sources`.

## What the payload looks like

For reference when debugging from `_Raw`:

```json
{
  "lead_id": "abc123",
  "api_version": "1.0",
  "form_id": 4242,
  "campaign_id": 777,
  "is_test": false,
  "google_key": "the key you set",
  "gcl_id": "…",
  "user_column_data": [
    { "column_id": "FULL_NAME",    "column_name": "Full Name",    "string_value": "Ana Reyes" },
    { "column_id": "PHONE_NUMBER", "column_name": "Phone Number", "string_value": "+63 917 123 4567" },
    { "column_id": "What type of event are you planning?",
      "column_name": "What type of event are you planning?", "string_value": "Corporate" }
  ]
}
```

The campaign id is written to the lead's **Campaign** column.
