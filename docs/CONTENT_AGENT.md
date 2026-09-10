# The content insights agent

Every Monday morning, a GitHub Action reads what people searched for, what they
found, what they did next, and which of them became an enquiry — then says what
to publish this week, on which channel, and why.

It runs in GitHub Actions. There is nothing to host, and on a private repo the
weekly run costs a couple of minutes of the included Actions allowance.

```
  Semrush  ─┐                                          ┌─►  dashboard.html
  Wix      ─┤                                          │
  GA4      ─┼──►  gather  ──►  analyse  ──►  brief  ───┼─►  content-calendar.csv
  Search   ─┤        │            │           │        │
  Console  ─┤        │            │           │        └─►  insights.json
  Lead     ─┘        │            │           │
  sheet              │            │           └── Claude writes the briefs
                     │            │
                     │            └── striking distance, low CTR, decay,
                     │                competitor gaps, unserved demand —
                     │                scored by volume, winnability, season
                     │                and which event types actually sell
                     │
                     └── whatever is configured; missing sources are
                         reported on the dashboard, never guessed at
```

---

## What it looks for

Five questions, asked every run. Each one produces opportunities carrying the
evidence that found them, so nothing on the dashboard is unattributable.

| Finding | What it means | What it asks for |
| --- | --- | --- |
| **Page two** | We rank 4–20 for something with real volume | Rework the page that already ranks |
| **Seen, not clicked** | High impressions, almost no clicks | A title and description rewrite — the content is fine |
| **Losing traffic** | A page down 30%+ against the previous 90 days | A refresh, with the reason stated |
| **Competitor gap** | They hold page one, we don't appear | Something better than what ranks now |
| **Unserved demand** | Impressions with no page addressing the topic | A new piece |

The same keyword often triggers several. They are merged, the strongest wins,
and all the evidence is kept — so a keyword that is simultaneously on page two,
badly titled and decaying shows up once, with all three reasons attached.

### How opportunities are ranked

Search volume is the base, on a log scale so one huge head term cannot bury
twenty realistic ones. It is then multiplied by:

- **Winnability** — a rewrite of something at position 6 beats starting from
  nothing, so the finding type and current position both weigh in.
- **Season** — measured against the moment buyers *decide*, not the month the
  event happens. A December wedding is largely booked by September; a May one
  is being chosen right now. The booking windows live in `agent/src/config.js`.
- **Demand** — learned from the lead sheet. Event types that actually produced
  enquiries are weighted up, gently enough that we don't get locked out of
  markets we haven't entered.

### How a channel is chosen

Long-form always gets the keyword, because it is the only channel that can rank
for it. Video is added only where seeing the thing is the point:

- A **pricing** question earns a short-form price breakdown alongside the article.
- A **visual** question — venue, setup, decor, "what does it look like" — earns
  a long-form walkthrough.
- An **informational** question earns a short explainer cut from the article, so
  it costs one shoot rather than two.

---

## Setting it up

Nothing below is required to try it. `npm run agent:offline` runs the whole
pipeline against fixtures and writes a real dashboard, with no accounts and no
network.

Add sources one at a time. Each one makes the plan better; none of them is a
prerequisite for the others, and the dashboard always shows which were live.

Secrets go in **Settings → Secrets and variables → Actions → Secrets**.
Non-secret settings go in the **Variables** tab beside it.

### Search Console and GA4 — start here

These are free, and Search Console is the single most useful source: it is the
only one that reports what people typed *and* whether they clicked.

Both use one Google service account.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project (or pick an existing one).
2. Enable the **Google Search Console API** and the **Google Analytics Data
   API**. Enable the **Google Sheets API** too if you want the lead-sheet
   source below.
3. **IAM & Admin → Service Accounts → Create service account.** No roles are
   needed at the project level.
4. On the new account: **Keys → Add key → Create new key → JSON.** A file
   downloads. It contains a private key — treat it like a password.
5. Grant it access to your data, using the `client_email` from that file:
   - **Search Console** → Settings → Users and permissions → Add user, as
     *Full* or *Restricted*.
   - **GA4** → Admin → Property access management → Add, as *Viewer*.
6. Base64-encode the JSON and store that, because a PEM private key does not
   survive being pasted into a secret box with its newlines intact:

   ```bash
   base64 -w0 service-account.json     # macOS: base64 -i service-account.json
   ```

| Name | Kind | Value |
| --- | --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Secret | The base64 string from step 6 |
| `SEARCH_CONSOLE_SITE` | Secret | Exactly as Search Console lists the property — `https://hizonscatering.com/` with the trailing slash, or `sc-domain:hizonscatering.com` for a domain property |
| `GA4_PROPERTY_ID` | Secret | The numeric ID from GA4 → Admin → Property details. Digits only, no `properties/` prefix |

The property must be the exact string Search Console shows. A URL-prefix
property and a domain property are different properties, and asking for the
wrong one returns 403.

### The lead sheet — the one that makes this worth running

This connects the content agent to the lead automation already in this repo.
Without it, the agent knows which pages get traffic. With it, it knows which
ones produce enquiries, and weights its recommendations accordingly.

Share the sales spreadsheet with the same service-account `client_email`, as
**Viewer**. Read-only: the agent never writes to it.

| Name | Kind | Value |
| --- | --- | --- |
| `LEADS_SPREADSHEET_ID` | Secret | The long ID from the sheet URL, between `/d/` and `/edit` |

It reads two tabs the automation already maintains — `_Sources` for the
per-form counts, and `All Leads` for the event-type mix.

### Semrush

Needs a **Guru or Business** subscription; the API is not available on Pro.
The key is under Profile → Subscription info → API units.

Each run costs roughly 2,000–4,000 units — the keyword export is billed per
line returned, and the agent pulls our keywords plus a reduced set for the top
three competitors. Weekly, that is comfortable on a Guru allowance.

| Name | Kind | Value |
| --- | --- | --- |
| `SEMRUSH_API_KEY` | Secret | From Subscription info → API units |
| `SEMRUSH_DATABASE` | Variable | `ph` for the Philippines. Defaults to `ph` |

### Wix

Used for the blog inventory — what has already been published, so the agent
recommends refreshing the 2024 guide rather than proposing you write it again.

Create an API key at [manage.wix.com/account/api-keys](https://manage.wix.com/account/api-keys)
with **Blog** read permissions, and **Analytics** read as well if you want the
on-site figures.

| Name | Kind | Value |
| --- | --- | --- |
| `WIX_API_KEY` | Secret | The generated key |
| `WIX_SITE_ID` | Secret | Site ID, from the same page |
| `WIX_ACCOUNT_ID` | Secret | Optional; some endpoints want it |
| `WIX_ANALYTICS_PATH` | Variable | Optional override — see below |

Wix has moved its analytics endpoint more than once and exposes different
measurements on different plans. If the run log reports a Wix analytics error,
the blog inventory still works, and GA4 covers the same ground better. Set
`WIX_ANALYTICS_PATH` to the path your plan actually serves if you want to
correct it without a code change.

### Claude

Without this the agent still finds and ranks every opportunity and still builds
the calendar — but the briefs are mechanical placeholders, and the dashboard
says so at the top. With it, each recommendation gets a real headline, an
angle, the points it must cover, and a list of what to shoot.

| Name | Kind | Value |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Secret | From [console.anthropic.com](https://console.anthropic.com/) |
| `ANTHROPIC_MODEL` | Variable | Optional. Defaults to `claude-opus-5` |

One request per run, a few cents at most.

### Site domain

| Name | Kind | Value |
| --- | --- | --- |
| `SITE_DOMAIN` | Variable | Optional. Defaults to the domain in `agent/src/config.js` |

---

## Running it

The workflow runs **Mondays at 07:00 Manila time**. To run it now: Actions →
*Content insights agent* → **Run workflow**. Tick *offline* to run against
fixtures without touching any API.

Each run produces:

| File | What it is |
| --- | --- |
| `dashboard.html` | The plan as a page — open it in a browser |
| `dashboard.fragment.html` | The same page without the document shell, for publishing as an Artifact |
| `content-calendar.csv` | The calendar, ready to import into Sheets |
| `insights.json` | Everything, structured — for anything else you want to build |
| `run.log` | What happened, including which sources answered |

They are attached to the run under **Artifacts**, kept for 90 days. The run
summary page also shows the plan as a table without downloading anything.

### The calendar

Recommendations are placed by priority into the first week that has room,
respecting two constraints from `agent/src/config.js`:

- **Capacity** — 2 blog pieces, 3 short videos and 1 long video a week.
- **Lead time** — 7 days for a blog piece, 3 for a short video, 14 for a long
  one, because a venue walkthrough has to be filmed before it can be published.

Anything that doesn't fit goes to a visible backlog with the reason, rather
than being quietly dropped.

To import into Sheets: File → Import → Upload → `content-calendar.csv` →
*Insert new sheet*.

---

## Locally

```bash
cd agent
npm install
npm run offline          # fixtures — no credentials, no network
npm test                 # 108 checks, no credentials, no network
```

To run against live data locally, set the same variables in your shell:

```bash
SEARCH_CONSOLE_SITE='https://hizonscatering.com/' \
GOOGLE_SERVICE_ACCOUNT_JSON="$(base64 -w0 service-account.json)" \
npm start
```

From the repository root, `npm run agent:offline` and `npm run test:agent` do
the same thing without changing directory.

---

## Tuning it

Everything worth adjusting is in **`agent/src/config.js`**:

- `CHANNELS` — the channels, their formats, weekly capacity and lead times.
  Adding a channel here is enough for it to appear in the plan and the calendar.
- `SEASONALITY` — peak months and how far ahead each event type is booked. This
  is the highest-leverage thing in the file: it decides what gets promoted this
  month, and it should match how your bookings actually arrive.
- `THRESHOLDS` — what counts as striking distance, what counts as decay, the
  minimum volume worth writing for.
- `PLAN` — how many opportunities reach the model, how many recommendations to
  publish, how many weeks to lay out.
- `BUSINESS` — positioning, market and event types. This is what Claude is told
  about you, and vaguer text here produces vaguer briefs.

Intent and event-type matching live in `agent/src/classify.js` as plain
patterns. New wording — a service you start offering, a phrase your market uses
— goes there.

After any change: `npm test`, then `npm run offline` and open the dashboard.

---

## When something is wrong

**The dashboard says a source is "not configured".** The secret is missing or
misnamed. The chip's tooltip names the exact variable it wants.

**"Semrush: WRONG KEY"** — the key is wrong, or the subscription doesn't include
API access. Pro plans do not.

**Search Console returns 403.** The service account isn't a user on that
property, or `SEARCH_CONSOLE_SITE` doesn't match the property string exactly.
A URL-prefix property and a domain property are different properties.

**GA4 returns 403.** The service account needs Viewer on the *property*, not the
account.

**"Google token exchange"** errors mean the service-account JSON didn't survive
being stored. Re-encode with `base64 -w0` and check nothing was truncated.

**Everything is empty but nothing errored.** Search Console reports nothing for
a site with very little traffic, and reports on a two-to-three day delay. Try a
longer window by raising `windowDays` in `comparisonWindows`.

**The briefs read like a robot wrote them.** No `ANTHROPIC_API_KEY`, or the call
failed. The dashboard states which, at the top, and `run.log` has the detail.
