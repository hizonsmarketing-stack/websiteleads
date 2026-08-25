# Connecting Wix forms

Each on-page form posts to the same webhook URL with its own `form` value. That
value becomes the lead's **sub-source**, so adding a form later is a matter of
choosing a new name — no code change, no redeployment.

## Name your forms first

Wix calls every new form **"My form"** until you rename it, and the form name
is what becomes the lead's sub-source. Leave them all as "My form" and every
form on the site collapses into one sub-source — it still works, it just stops
telling you which form converted.

Rename each one in Wix first: *Homepage Inquiry*, *Wedding Package Inquiry*,
*Corporate Events Inquiry*, and so on. Those names then appear on every lead
with no further configuration, and adding a form later needs none at all.

The automation flags this for you: a form registered under a builder default
name gets a note to that effect in the `_Sources` tab.

## The URL

```
https://script.google.com/macros/s/AKfy…/exec?source=website&form=Homepage%20Inquiry&token=YOUR_TOKEN
```

- `source=website` — tags every lead from this form as **Website**.
- `form=…` — the sub-source. URL-encode spaces as `%20`.
- `token=…` — the shared secret from **Leads → Set webhook token…**.

**Leads → Show webhook URL** prints this for you, token included.

### If Wix reports a 404

The request never reached the script. In order of likelihood:

1. **The URL ends in `/dev` instead of `/exec`.** `/dev` is the test endpoint
   and only answers the logged-in editor; everyone else gets a 404. Copy the
   live one from *Apps Script → Deploy → Manage deployments*.
2. **Nothing is deployed.** *Manage deployments* should list a **Web app** with
   *Execute as: Me* and *Who has access: Anyone*.
3. **Something extra got pasted** — a label, a stray space, a line break, or a
   quote around the URL.

Open the exact URL in a browser to tell these apart: `{"status":"ok", …}` means
the endpoint is live and the problem is in what Wix has; a 404 in the browser
means it is the deployment.

## Wiring it up in Wix

1. In your Wix dashboard: **Automations → + New Automation**.
2. **Trigger**: *Form submitted* (Wix Forms), and pick the form.
3. **Action**: under *Integrations*, choose **Send HTTP request**.
   (Wix used to call this *Send via Webhook*. Do **not** pick *Update Google
   Sheets* — that writes rows straight into a sheet and skips the
   deduplication, tagging and routing entirely.)
4. Configure the request:
   - **Method**: `POST`
   - **URL**: the URL above, with `form=` set to that form's name
   - **Header**: `Content-Type` = `application/json`
   - **Body**: the form's fields. Wix names them `field:<slug>` — that is
     understood as-is, so insert the tokens for that form and leave the names
     alone. Include `formName` too: it is what tags the lead's sub-source.

     These all read correctly without any configuration:

     | Wix field | Read as |
     | --- | --- |
     | `field:full_name`, `field:your_name` | Full Name |
     | `field:email_adress` *(typo and all)* | Email |
     | `field:contact_number`, `field:phone_number` | Phone |
     | `field:event_type`, `field:whats_the_occasion`, `field:type_of_celebration` | Event Type |
     | `field:event_date`, `field:when_is_your_event`, `field:target_date_of_event` | Event Date |
     | `field:estimated_guest_count`, `field:estimated_number_of_guests` | Guest Count |
     | `field:which_venue_are_you_interested_in`, `field:target_location_venue` | Venue |
     | `field:budget_range` | Budget |
     | `field:company_name_49ed` | Company |

     Anything else is kept in the lead's Message column rather than dropped.
     Wix's own bookkeeping — `contactId`, `submissionsLink`, `formId`,
     checkbox placeholders — is ignored.
5. Save and activate.

Whatever shape Wix ends up sending is accepted — nested or flat, any field
names. If a field doesn't land where you expect, **Leads → Show last received
payload** prints exactly what arrived, which is what to work from.

Repeat per form, changing only the `form=` value:

| Form on the site | `form=` value |
| --- | --- |
| Homepage inquiry block | `Homepage%20Inquiry` |
| Wedding package page | `Wedding%20Package%20Inquiry` |
| Corporate events page | `Corporate%20Events%20Inquiry` |
| Contact page | `Contact%20Us` |
| Footer newsletter | `Footer%20Newsletter` |

Use the same names you'd want to read on a sales tab — they show up on every
lead and on the Dashboard's sub-source breakdown.

### One field worth knowing about

`field:contact_person_from_hizons_catering` is deliberately **not** read as the
client's name — it is your staff member, and treating it as the lead's Full
Name would put a colleague's name on the lead. It goes into the Message column
instead.

### Wix Velo instead

If the form is custom-coded, post to the same URL from backend code:

```js
import { fetch } from 'wix-fetch';

export async function sendLead(values) {
  await fetch(
    'https://script.google.com/macros/s/AKfy…/exec' +
    '?source=website&form=Custom%20Quote%20Builder&token=YOUR_TOKEN',
    {
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    }
  );
}
```

Keep the token in Velo's *Secrets Manager* rather than in page code.

## What to put on the form

The automation reads whatever shape the payload arrives in, nested or flat, and
matches field names loosely — `Contact No.`, `Mobile Number` and `phone` all
mean the same thing to it. To get the most out of it:

- **An event type question is the single most valuable field.** A dropdown of
  *Wedding / Corporate / Debut or Birthday / Private Event / Other* routes leads
  perfectly. Without it, leads land in **Unassigned** unless the wording
  elsewhere gives them away.
- **Ask for a phone number as well as an email.** Deduplication matches on
  either, so a phone number catches the same person coming back through a
  different channel with a different address.
- **Anything else is welcome.** Questions the automation doesn't recognise are
  written into the lead's **Message** column as `Question: answer`, never
  dropped.

Full details in [FIELD_MAPPING.md](FIELD_MAPPING.md).

## Testing a form

Submit it. Then check, in order:

1. The team tab for the event type you selected.
2. `_Sources` — the form should be registered there with a lead count.
3. `_Log` — every request is logged, including rejections.
4. `_Raw` — the exact payload Wix sent, if you need to see why a field didn't
   map.
