// Server-side proxy for Claude document extraction.
// The Anthropic API key is read from the ANTHROPIC_API_KEY env var and never
// exposed to the browser. The client sends the already-built `messageContent`
// (PDF document block, or text for Excel/Word) and this forwards it to Claude.
const { requireAuth } = require('./_auth');
const MODEL = 'claude-opus-4-8';
const MAX_TOKENS = 16000;
const REQUEST_TIMEOUT_MS = 50000;        // per-attempt cap, kept under the 60s function limit
const MAX_RETRIES = 2;                   // extra attempts for fast, transient upstream errors
// Transient statuses worth retrying within this invocation (they fail fast).
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 529]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callAnthropic(apiKey, messageContent) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: messageContent }]
      }),
      signal: controller.signal
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  // Gate before spending any Anthropic credits — no valid session, no call.
  if (!(await requireAuth(req, res))) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' });

  const { messageContent } = req.body || {};
  if (!messageContent) return res.status(400).json({ error: 'Missing messageContent' });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(500 * attempt); // 500ms, 1000ms backoff
    try {
      const { ok, status, data } = await callAnthropic(apiKey, messageContent);
      if (ok) return res.status(200).json(data);

      const msg = data?.error?.message || ('Anthropic API error ' + status);
      const retryable = RETRYABLE_STATUS.has(status);
      if (retryable && attempt < MAX_RETRIES) {
        console.error(`[extract] attempt ${attempt + 1} failed (HTTP ${status}): ${msg} — retrying`);
        continue;
      }
      console.error(`[extract] failed (HTTP ${status}): ${msg}`);
      return res.status(status).json({ error: msg, retryable });
    } catch (err) {
      // Network error or per-attempt timeout (AbortError). Don't burn the time
      // budget retrying a timeout in-process — surface it as retryable so the
      // client can re-invoke with a fresh duration budget.
      const timedOut = err.name === 'AbortError';
      const msg = timedOut
        ? 'Extraction timed out — the document may be large. Please try again.'
        : ('Network error contacting Anthropic: ' + err.message);
      console.error(`[extract] attempt ${attempt + 1} ${timedOut ? 'timed out' : 'errored'}: ${err.message}`);
      if (!timedOut && attempt < MAX_RETRIES) continue;
      return res.status(504).json({ error: msg, retryable: true });
    }
  }

  return res.status(504).json({ error: 'Extraction failed after retries. Please try again.', retryable: true });
};
