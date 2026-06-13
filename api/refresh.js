// Exchanges a refresh token for a fresh session. Called by the client when an
// access token is rejected (401), so the user stays logged in without re-entering
// credentials. Uses the server-side anon key only.
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { refresh_token } = req.body || {};
    if (!refresh_token) return res.status(400).json({ error: 'Missing refresh_token' });

    const { data, error } = await supabase.auth.refreshSession({ refresh_token });
    if (error || !data || !data.session) {
      return res.status(401).json({ error: 'Could not refresh session' });
    }
    const { access_token, refresh_token: new_refresh, expires_at } = data.session;
    return res.status(200).json({ access_token, refresh_token: new_refresh, expires_at });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
