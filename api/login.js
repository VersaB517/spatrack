// Server-side login proxy. The browser POSTs email+password here; this uses the
// server-side anon key to authenticate against Supabase and returns the session
// tokens. No Supabase key is ever exposed to the browser.
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data || !data.session) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const { access_token, refresh_token, expires_at } = data.session;
    return res.status(200).json({ access_token, refresh_token, expires_at });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
