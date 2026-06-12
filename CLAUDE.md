# CLAUDE.md

Guidance for working in the SPAtrack codebase.

## What this is

**SPAtrack** is a single-tenant web app for a network-infrastructure distributor's sales team to manage **Special Pricing Agreements (SPAs)** — negotiated vendor discounts tied to specific end-user accounts. It tracks expiration dates, surfaces renewal alerts, imports vendor SPA/quote documents via the Claude API, and reports price changes across renewals ("Price Intel").

Deployed at https://spatrack.app (Vercel).

## Stack

- **Frontend:** A single `index.html` (~1,950 lines) of vanilla JS — no framework, no build step. All UI is built imperatively via a custom `h(tag, attrs, ...kids)` DOM helper and a single global mutable state object `S`. The whole app re-renders by clearing `#app` and rebuilding (`render()`); some hot paths patch `#main` directly.
- **Backend:** Vercel serverless functions in `api/*.js` (CommonJS, `module.exports = async function handler(req,res)`). Thin CRUD wrappers over Supabase.
- **Database:** Supabase (PostgreSQL) accessed server-side via `@supabase/supabase-js` (the only npm dependency).
- **Document extraction:** Anthropic Claude API (`claude-opus-4-8`), called through a **server-side proxy** (`api/extract.js`) that holds the key in an environment variable. The browser never sees the key.
- **Client libraries (CDN):** `xlsx` (SheetJS) for Excel parsing and `mammoth.js` for Word `.docx` text extraction — both loaded via `<script src>` in `index.html`.

## Layout

```
index.html        Entire frontend: styles, state, data layer, AI extraction, all views
api/spas.js       CRUD for SPAs (GET/POST/PUT/DELETE)
api/margins.js    CRUD for per-account margins (GET/POST upsert/DELETE)
api/history.js    SPA renewal price-change history (GET last 2 years / POST)
api/extract.js    Server-side proxy to the Claude API for document extraction
vercel.json       Routes /api/* to handlers; everything else → index.html (SPA fallback)
package.json      Single dep: @supabase/supabase-js
```

## Architecture

### Data flow
```
Browser (index.html)
  ├─ CRUD ─────> /api/spas, /api/margins, /api/history ──> Supabase Postgres
  ├─ AI extract > /api/extract ──> api.anthropic.com (server's key)
  └─ Doc upload > Supabase Storage REST (direct, optional)  [bypasses backend]
```

The DB handlers are pure pass-throughs to Supabase. Claude extraction now goes through `api/extract.js`, which injects the Anthropic key server-side — the browser builds the prompt/message content but never holds the key. Supabase Storage upload (optional) is still done client-side.

### Frontend internals (`index.html`)
Organized into commented sections:
- **CONFIG** — `EXPIRING_DAYS=14` (alert threshold), `EU_COLORS`, localStorage key for the API key.
- **DATA LAYER** — `apiGet/apiPost/apiPut/apiDel` thin `fetch` wrappers; `loadAll()` fetches spas+margins and maps snake_case DB columns ↔ camelCase client fields.
- **State** — one global `let S = {...}`. Mutate via `set(patch)` which merges and re-renders. Modals are booleans on `S` (`showAdd`, `showImport`, `showApiKey`, etc.).
- **Mutations** — `doAddSPA`, `doEditSPA`, `doDelete`, account (margin) CRUD, renewal handling.
- **FILE IMPORT + AI EXTRACTION** — `getFileType`, `doExtract` (the core extraction routine), `uploadDocToSupabase`.
- **COMPUTED** — `getSrc`, `getSearchResults`, `getSummary` derive views from `S`.
- **Render functions** — `render()` (nav + account bar + search + dispatch), `renderDashboard`, `renderSPAs`, `renderHistory`, `renderSearch`, plus modal builders (`spaForm`, `importModal`, `apiKeyModal`, `spaFocusModal`).
- **BOOT** — `boot()` calls `loadAll()` and kicks off the first render.

### Views (top nav)
- **Overview** (`dashboard`) — summary cards + expiring/expired alerts.
- **SPA Library** (`spas`) — the full SPA list with filtering by account/vendor/status, search, edit/renew/delete.
- **Price Intel** (`history`) — per-account renewal history with price deltas (lazy-loaded via `loadHistory()`).

### AI document extraction (`doExtract`, ~line 466)
The most domain-heavy part of the app:
1. Guesses the vendor from the filename and selects a **vendor-specific prompt profile** (Belden, Panduit, Corning, Prysmian, CommScope, Eaton, Siemon, Legrand family, etc.) — each encodes that vendor's quirks (which field holds the end-user, how SPA price vs. list/cost columns map, UOM conversions like per-1000ft → per-foot).
2. Builds the Claude message content by file type:
   - **PDF** → sent as a `document` content block (base64).
   - **Excel** → parsed to CSV client-side with SheetJS, sent as text.
   - **Word** → text extracted with mammoth.js (manual XML regex fallback), sent as text.
3. POSTs the built `messageContent` to **`/api/extract`**, which forwards it to `https://api.anthropic.com/v1/messages` with `model: claude-opus-4-8`, `max_tokens: 16000`, and the server-held API key. (The file parsing and prompt building stay client-side; only the authenticated Anthropic call is server-side.)
4. Parses the JSON reply: `extractJsonObject()` isolates the first complete `{…}` object (string-aware brace scan) so leading/trailing prose or ``` fences around the JSON don't break parsing, then a **best-effort repair** handles truncated JSON from large docs (strips partial trailing items, balances brackets). On total failure it `console.error`s the raw response and surfaces a snippet in the error message.
5. Maps the extracted `endUser` to an existing account if names match, then drops the user into a **review form** before anything is saved.

Pricing model note: the app does **not** store the SPA price directly. It stores `listPrice`/`stdCost` + a `discount` %, and computes SPA price as `(listPrice or stdCost) × (1 − discount/100)`. The extraction prompt enforces this convention per vendor.

### Renewal & Price Intel flow
When an expired SPA is replaced (`S._replacingSPA` set), `doAddSPA` computes a per-line price delta (old vs. new SPA price, including added/removed parts), deletes the old SPA, and writes the diff to `spa_history` via `saveHistory`. Price Intel reads these rows.

## Database (Supabase Postgres)

Inferred from the API handlers — there are no migration files in the repo.

- **`spas`** — `id, vendor, end_user, spa_number, discount, expiration, category, items (jsonb), renewal_status, doc_url, renewal_requested`. `items` is an array of `{partNumber, description, listPrice, stdCost, qty, uom}`.
- **`margins`** — `end_user (unique), margin`. Doubles as the canonical **account list** (an account exists if it has a margin row). Upserted on `end_user`.
- **`spa_history`** — `vendor, end_user, old_spa_number, new_spa_number, renewed_at, old_discount, new_discount, delta_items (jsonb)`.
- **Storage bucket** `spa-documents` — optional public bucket for uploaded source docs.

## Environment / configuration

**Serverless (Vercel project env vars):**
- `ANTHROPIC_API_KEY` — used by `api/extract.js` for the Claude call.
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

**Client-side:**
- Supabase Storage upload (optional) reads `<meta name="supa-url">` / `<meta name="supa-key">` from the HTML; if absent, document upload is skipped silently.

## Conventions & gotchas

- **No build, no bundler, no tests.** Editing `index.html` directly is the workflow. There is no lint/test/CI setup in the repo.
- **DB ↔ client field naming:** DB is `snake_case`, client is `camelCase`. The mapping lives in `loadAll()` and each `do*` mutation — keep both sides in sync when adding fields.
- **CORS:** every API handler sets `Access-Control-Allow-Origin: *` and handles `OPTIONS`.
- **Accounts are margin rows.** Creating/renaming/deleting an "account" (end user) is really a `margins` operation; renaming also rewrites `end_user` on all that account's SPAs.
- **State is global and mutable.** Prefer `set({...})` over mutating `S` then calling `render()` manually, except in the search-input hot path which patches `#main` directly for responsiveness.
- **Claude model:** pinned to `claude-opus-4-8` via the `MODEL` constant at the top of `api/extract.js`. Change it there (not in the frontend). The PDF base64 now flows through the serverless function, so very large PDFs are bounded by Vercel's request body limit (~4.5 MB) — Excel/Word are sent as extracted text and stay small.
- **Extraction resilience:** `api/extract.js` retries fast transient upstream errors (408/429/500/502/503/529) up to 2× with backoff, uses a 50s per-attempt `AbortController` timeout, and `console.error`s every failure. Timeouts return `504 {retryable:true}` rather than retrying in-process (no time budget left). `maxDuration: 60` is set for `api/extract.js` in `vercel.json` (default is 10s — too short for Opus extractions). The client (`doExtract`) auto-retries once on a network error or a `retryable`/5xx/429 response, then shows a retry-guidance message. When changing one side, keep the `retryable` flag contract in sync.
- **Single-price-column vendors** (Belden, Panduit, …): the profile must say "store that price as `listPrice`, set `stdCost=0` and `discount=0`" — never "set `listPrice=0`". An earlier contradiction (vendor block said set everything to 0, general rule said store as listPrice) caused the model to non-deterministically zero all prices. Vendor profiles override the general rules, so the price-capture instruction must live in the vendor block itself.
- **Prices must be numeric.** The prompt requires plain-number price fields, and `toNum()` defensively strips `$`/commas/units before storing (`parseFloat("$1,234.50")` would otherwise yield `0` and show as $0.00).

## Local development

There is no scripted dev server. To run with full functionality use the Vercel CLI so the `api/*` functions and routing work:

```
npm install
vercel dev          # serves index.html + /api/* locally
```

You will need `ANTHROPIC_API_KEY`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` in the local environment — the first for AI import via `/api/extract`, the latter two for the database routes.
