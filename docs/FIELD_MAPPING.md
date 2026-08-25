# How fields are understood

No two forms name things the same way. Rather than maintaining one mapping per
form, every incoming record — a Wix webhook body, a Google Ads payload, a row of
an organiser's worksheet — is flattened into key/value pairs, and each key is
matched against an alias dictionary.

## The matching rules, in order

1. **Squash the key.** Lowercase, strip everything that isn't a letter or digit.
   `Contact No.`, `contact_no` and `CONTACT NO` all become `contactno`.
2. **Exact alias match.** `contactno` is a listed alias of **Phone**. Done.
3. **Contained alias match.** A question-style header like *"What type of event
   are you planning?"* contains `typeofevent`, an alias of **Event Type**. The
   longest alias that fits wins, so the most specific reading is used. Aliases
   shorter than five characters are not matched this way, to stop `date`
   matching *candidate*.
4. **Suffix rule.** Anything ending in `date` that matched nothing else is
   treated as the **Event Date** — this is what makes an unfamiliar
   `Wedding Date` or `Anniversary Date` column work. `email` is handled the
   same way.
5. **No match?** The answer is kept, labelled, in the lead's **Message**
   column — `How Did You Hear About Us: Instagram`. Nothing is discarded.

**Two columns wanting the same destination** is normal — a worksheet with both
`SALES NOTES` and `CLIENT NOTES`, or two phone columns for a mobile and a
landline. Nothing is dropped:

- **Notes columns all survive.** One notes column reads as plain text, the way
  the person wrote it. Several get labelled with their own headers, so a rep can
  tell the client's words from an internal note:

  ```
  Contact Method: Viber please
  Sales Notes: Called twice, no answer
  Client Notes: Wants a garden setup
  ```

- **For every other field the stronger match wins the column**, and the weaker
  one is written into Message rather than discarded. Two phone columns give you
  the first as **Phone** and the second as `Contact No 2: 0918…` in the notes.

Two kinds of key are dropped outright: webhook plumbing
(`g-recaptcha-response`, `submission_id`, `is_test`) and internal columns the
sales team has asked not to carry over. Both live in `NOISE_KEYS` in
`src/00_Config.gs` — add a header there to stop it reaching the sales tabs at
all.

## The canonical fields

| Field | Recognised as, among others |
| --- | --- |
| Full Name / First / Last | name, full name, client name, contact person, `FULL_NAME` |
| Email | email, e-mail, email address, work email, `EMAIL` |
| Phone | phone, mobile, contact number, contact no, cellphone, viber, `PHONE_NUMBER` |
| Company | company, organization, business name, `COMPANY_NAME` |
| Event Type | event type, type of event, occasion, inquiry type, celebration |
| Event Date | event date, preferred date, target date, wedding date, *anything ending in "date"* |
| Guest Count | guests, number of guests, pax, headcount |
| Venue / Location | venue, location, preferred venue, area, city |
| Budget | budget, budget range, budget per head |
| Message | message, notes, remarks, inquiry details, special requests |
| Campaign | campaign, campaign id, utm campaign, ad group |
| Presenter | presenter, presentor, presented by, endorsed to |
| Sub-Source | form, form name, fair name, event name |

The full lists are `FIELD_ALIASES` in `src/00_Config.gs`.

## Writing back into your own columns

The same matching decides where values are *written*, not just where they are
read from. A tab whose phone column is called `Contact number` keeps using it —
no `Phone` column appears beside it — and new leads fill it normalised.

Resolution runs in two passes so it is predictable:

1. A column named exactly like a canonical one claims that field, wherever it
   sits in the sheet.
2. Aliases fill what is left, the leftmost column winning.

Free-text notes are deliberately excluded from the second pass. A tab often has
several notes columns, and binding the composed message to whichever came first
would overwrite one of them, so notes always go to a **Message** column of their
own.

## Teaching it a new column name

When a preview shows an important column as `(notes)`, add the header to the
right alias list:

```js
  phone: [
    'phone', 'phone number', 'mobile', 'mobile number', 'mobile no',
    'contact number', 'contact no', 'contact', 'cell', 'cellphone',
    'telefono',          // <- add it here
    …
  ],
```

Save (or `npm run push`). No redeployment is needed — alias changes take effect
on the next import or submission. Run `npm test` first if you have the repo
checked out.

## How values are cleaned up

| Input | Stored as | Why |
| --- | --- | --- |
| `0917 123 4567`, `(0917) 123-4567`, `+63 917 123 4567`, `9171234567` | `+639171234567` | So the same person's number matches across channels |
| `+1 415 555 0132`, `001 415 555 0132`, `1 415 555 0132` | `+14155550132` | Numbers with their own country code are left alone, with or without the `+` |
| `+65 9123 4567` **and** `65 9123 4567` | `+6591234567` | Both are Singapore, so both dedupe to one person |
| `  Maria.Cruz@Gmail.COM ` | `maria.cruz@gmail.com` | Case and spacing shouldn't create a second lead |
| `maria+expo@gmail.com` | stored as typed; matched as `maria@gmail.com` | Tagged addresses are the same inbox (toggle: *Dedupe Ignore Plus Tags*) |
| `MARIA CRUZ` | `Maria Cruz` | All-caps worksheets are common |
| `12/14/2026`, `14/12/2026`, `2026-12-14` | `2026-12-14` | Month-first is assumed; day-first is used when the first number is over 12 |
| `03/04/2027` in a historical tab | left as typed, and reported | Could be read either way; see [EXISTING_LEADS.md](EXISTING_LEADS.md#dates) |
| `sometime next year` | kept as written | Better an odd date than a lost one |
| `around 150 pax` | `150` |  |
| `100 - 150` | `100-150` | Ranges are preserved |

The original phone text is always kept in **Phone (Raw)**, and the original
event-type wording in **Event Type (Raw)**.

### Numbers from abroad

Enquiries arrive from the diaspora and from guests planning an event back home,
so a number is only treated as local when it can be. One written with a `+` or
a `00` is taken as it stands. One written without either is read as
international when it starts with a recognised calling code and is long enough
to be a real number there — `65 9123 4567` is Singapore, not a Philippine
number with a stray 65 on the front.

The order matters because of one trap: a local mobile written without its
leading zero, `9171234567`, starts with `91`, which is India's calling code.
Local always wins first, so that number is never misread. The rule is:

1. Anything starting with the local mobile prefix (`9`, set by
   `Local Mobile Prefix`) and short enough to be local **is** local.
2. Otherwise, a recognised calling code with at least seven digits after it and
   ten digits in total is international.
3. Otherwise it is local, and the default country code is added.

Calling codes live in `INTERNATIONAL_DIAL_CODES` in `src/00_Config.gs`. Add one
if enquiries start arriving from somewhere it does not cover — a number from an
unlisted country still works when the guest types the `+`.

Phone columns are formatted as plain text, so the leading `+` survives instead
of being read as a formula, and a long number is never shown as `6.39E+11`.

## How event types are decided

The event type value is checked against each configured type's keyword list,
and the **longest matching keyword wins** — the most specific reading of the
wording:

| The form said | Routed to | Because |
| --- | --- | --- |
| `Corporate` | Corporate | exact match on the type's name |
| `Company Christmas Party` | Corporate | `christmas party` beats `party` |
| `Corporate Anniversary` | Corporate | `corporate anniversary` beats `anniversary` |
| `Church Wedding Reception` | Wedding | `church wedding` beats `wedding` |
| `Wedding Anniversary` | Private Event | `anniversary` beats `wedding` — it isn't a wedding |
| `Debut / 18th Birthday` | Debut | `18th birthday` beats `birthday` |
| `Kiddie Party` / `Christening` / `1st Birthday` | Kid's Party | the specific wording wins |
| `Birthday celebration` | Private Event | a plain birthday, with nothing else to go on |
| `Intimate family gathering` | Private Event | `family gathering` |
| `Bar mitzvah` | Unassigned | nothing matched |

**The plain-`birthday` default is a judgement call.** With no other wording, a
birthday is treated as an adult's party — a Private Event. If most of your
birthday enquiries are children's parties, move `birthday` and `bday` from the
`private` keyword list to the `kids` list in `src/00_Config.gs`.

If the event-type field is blank, the **sub-source name and the message body**
are searched as weaker evidence — so a lead from a form called *Wedding Package
Inquiry*, or one who wrote "looking for a venue for our wedding reception",
still routes correctly.

Failing all that, the lead goes to **Unassigned**, and gets moved to a real team
tab automatically if a later submission from the same person names the event
type.

Keywords live in `EVENT_TYPES` in `src/00_Config.gs`; see
[OPERATIONS.md](OPERATIONS.md#adding-an-event-type-or-team-tab).
