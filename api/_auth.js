// Shared auth guard for the API functions. Not a route itself (not listed in
// vercel.json) — it's bundled because the route handlers require() it.
// Verifies the caller's Supabase session by validating the Bearer access token
// against Supabase Auth using the server-side anon key (no key reaches the browser).
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Returns the authenticated user, or sends a 401 and returns null.
// Usage in a handler (after the OPTIONS short-circuit):
//   if (!(await requireAuth(req, res))) return;
async function requireAuth(req, res) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data || !data.user) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return null;
    }
    return data.user;
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return null;
  }
}

module.exports = { requireAuth };
