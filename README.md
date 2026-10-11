# astromool (JavaScript / TypeScript)

Official client for the [AstroMool API](https://developers.astromool.com/docs): Vedic charts computed from the
Swiss Ephemeris, the 90 astromool.com calculators, and the full PDF reports. Node.js 18+ (or any runtime with
`fetch`). No dependencies. Types included.

```js
import AstroMool from "astromool";            // or: const { AstroMool } = require("astromool");

const am = new AstroMool(process.env.ASTROMOOL_KEY);   // am_test_... while you build, am_live_... in production

const birth = { date: "1995-08-14", time: "10:35", tz_id: "Asia/Kolkata", lat: 25.5941, lon: 85.1376 };
const chart = await am.planets(birth);                 // { data, meta }
console.log(chart.data.ascendant.sign, chart.meta.ayanamsa);

const m = await am.calculators.run("manglik-dosha-calculator-by-date-of-birth", birth);
console.log(m.data.summary);                            // "Manglik - intensity 18/100" (string or null)
```

Every call resolves to the API's envelope `{ data, meta }`. `meta` states the ayanamsa, the UTC offset used and
the engine version; read `meta.warnings` - it flags things like a birth time that did not exist because of a DST change.

## What each calculator needs

`calculators.list()` gives every calculator's `input`: `for` is `birth` (birth chart), `today` (today, read for the
chart), `year` (send `params.year` / `params.month`), `date` (send `params.date`) or `next` (the next occurrence);
`params` names the extra inputs it uses; `basic_output: false` means its answer is the full text.

```js
// muhurat / festival lists: the place, and the year you want (default: this year at the place)
const v = await am.calculators.run("vivah-muhurat-dates", { lat: 28.61, lon: 77.21, tz_id: "Asia/Kolkata" }, { params: { year: 2027, month: 2 } });
// the reading behind a summary, when the calculator has one
const s = await am.calculators.run("sade-sati-calculator-by-date-of-birth", birth);
s.data.guidance?.sections?.forEach((x) => console.log(x.title, x.text ?? x.body ?? x.rows));
```

## Methods

| Method | API |
|---|---|
| `planets(birth, { ayanamsa, node })` | `POST /v1/vedic/planets` |
| `calculators.list()` | `GET /v1/calculators` |
| `calculators.run(slug, person, { partner, params, detail })` | `POST /v1/calculators/{slug}` |
| `reports.create(slug, person, { partner, params, lang, webhookUrl, idempotencyKey })` | `POST /v1/reports/{slug}` |
| `reports.get(id)` / `reports.waitUntilReady(id, { timeout })` | `GET /v1/reports/{id}` |
| `reports.download(downloadUrl)` | the signed PDF link (Uint8Array) |
| `geo.search(q, limit)` / `geo.timezone(tzId, date, time)` | `/v1/geo/*` |
| `meta.ayanamsas(date)`, `usage()`, `health()` | |

## Reports

```js
const r = await am.reports.create("kundli-matching-by-date-of-birth", groom, { partner: bride, lang: "both" });
const ready = await am.reports.waitUntilReady(r.data.report_id);
fs.writeFileSync("report.pdf", await am.reports.download(ready.data.download_url));
```

`reports.create` sends an `Idempotency-Key` (generated if you do not pass one), so an automatic retry never
creates a second report.

## Errors and retries

Failures throw `AstroMoolError` with `status`, `code` (stable - see the [errors page](https://developers.astromool.com/errors)),
`detail` (how to fix it), `requestId`, and `field` for input errors. The client retries `rate_limited` (waiting the
server's `Retry-After`), 5xx answers and network errors - `maxRetries` (default 2). `quota_exceeded` is never retried.

```js
try { await am.planets({ ...birth, date: "14/8/95" }); }
catch (e) { if (e instanceof AstroMoolError && e.code === "bad_date") { /* e.detail says the accepted formats */ } }
```

Options: `new AstroMool(key, { baseUrl, timeout /* ms, default 30000 */, maxRetries, fetch })`.

## Webhooks

Pass `webhookUrl` to `reports.create` to be called when the report is ready. Verify each call with your webhook
secret (dashboard > Keys) and the **raw** body:

```js
import { verifyWebhook } from "astromool";
app.post("/astromool-hook", express.raw({ type: "application/json" }), (req, res) => {
  const event = verifyWebhook(req.body, req.get("X-AstroMool-Signature"), process.env.ASTROMOOL_WEBHOOK_SECRET);
  // event = { event: "report.ready" | "report.failed", report_id, status, download_url? }
  res.sendStatus(200);
});
```

## Keys

Keep `am_live_` keys on your server. In a browser use a widget key (`am_pub_...`), which only works from the
domains you registered on it.

MIT licence.
