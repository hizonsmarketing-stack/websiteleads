# Connecting Wix forms

Each on-page form posts to the same webhook URL with its own `form` value. That
value becomes the lead's **sub-source**, so adding a form later is a matter of
choosing a new name — no code change, no redeployment.

## The URL

```
https://script.google.com/macros/s/AKfy…/exec?source=website&form=Homepage%20Inquiry&token=YOUR_TOKEN
```

- `source=website` — tags every lead from this form as **Website**.
- `form=…` — the sub-source. URL-encode spaces as `%20`.
- `token=…` — the shared secret from **Leads → Set webhook token…**.

**Leads → Show webhook URL** prints this for you, token included.

## Wiring it up in Wix

1. In your Wix dashboard: **Automations → + New Automation**.
2. **Trigger**: *Form submitted* (Wix Forms), and pick the form.
3. **Action**: *Send via Webhook*.
4. Paste the URL above, with `form=` set to that form's name.
5. Save and activate.

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
