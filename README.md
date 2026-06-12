# SPAtrack

**Special Pricing Agreement manager** for a network-infrastructure distributor's sales team.

SPAtrack tracks vendor Special Pricing Agreements (SPAs) — negotiated discounts tied to specific end-user accounts — surfaces expiration and renewal alerts, imports vendor SPA/quote documents with AI, and reports price changes across renewals.

🔗 Live: [spatrack.app](https://spatrack.app)

## Features

- **SPA library** — track vendor, end user, SPA number, discount, expiration, category, and line items in one place.
- **Expiration & renewal alerts** — SPAs nearing expiry (within 14 days) or expired are flagged in the Overview and account list.
- **AI document import** — upload a vendor SPA or quote as **PDF, Excel (.xlsx), or Word (.docx)** and Claude extracts the structured data. Vendor-specific parsing profiles (Belden, Panduit, Corning, Prysmian, CommScope, Legrand family, and more) handle each manufacturer's quirky pricing layouts.
- **Price Intel** — when a SPA is renewed, the per-line price delta (old vs. new) is recorded so you can see how pricing has moved per account over time.
- **Per-account margins** — store a margin per end user for downstream price calculations.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS, single `index.html`, no build step |
| Backend | Vercel serverless functions (`api/*.js`) |
| Database | Supabase (PostgreSQL) |
| AI extraction | Anthropic Claude API (`claude-opus-4-8`), proxied server-side |
| Client libs | SheetJS (`xlsx`), `mammoth.js` — via CDN |
| Hosting | Vercel |

## Project structure

```
index.html        Entire frontend (UI, state, views, document parsing)
api/spas.js       CRUD for SPAs
api/margins.js    CRUD for per-account margins (also the account list)
api/history.js    SPA renewal price-change history
api/extract.js    Server-side proxy to the Claude API for document extraction
vercel.json       Route map (/api/* → handlers, everything else → index.html)
```

## How AI import works

1. The browser parses the uploaded file: PDFs are sent as a base64 document block; Excel is converted to CSV with SheetJS; Word text is extracted with mammoth.js.
2. A vendor is guessed from the filename to select a parsing profile, and a structured-extraction prompt is built.
3. The request is POSTed to **`/api/extract`**, a serverless function that forwards it to the Anthropic API using the server's API key. The key never reaches the browser.
4. Claude returns JSON, which is shown in a review form before anything is saved.

## Configuration

Set these environment variables in the Vercel project (or a local `.env` for `vercel dev`):

| Variable | Used by | Purpose |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | `api/extract.js` | Server-side Claude API access for document import |
| `SUPABASE_URL` | all DB handlers | Supabase project URL |
| `SUPABASE_ANON_KEY` | all DB handlers | Supabase API key |

Optional document upload to Supabase Storage reads `<meta name="supa-url">` / `<meta name="supa-key">` from `index.html`; if absent, upload is skipped.

## Local development

Use the Vercel CLI so the API routes and serverless functions run locally:

```bash
npm install
vercel dev
```

Then open the printed local URL. The API routes need `ANTHROPIC_API_KEY`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` available in the environment.

## Deployment

Pushes deploy via Vercel. Ensure the three environment variables above are set in the Vercel project settings.

## Notes

- There is no build step, bundler, or test suite — `index.html` is edited directly.
- Database column names are `snake_case`; the client uses `camelCase`. The mapping lives in `loadAll()` and each mutation in `index.html`.
- See [CLAUDE.md](CLAUDE.md) for a deeper architecture reference.
