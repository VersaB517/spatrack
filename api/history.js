const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./_auth');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req, res))) return;
  try {
    if (req.method === 'GET') {
      // Return last 2 years only
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const { data, error } = await supabase
        .from('spa_history')
        .select('*')
        .gte('renewed_at', twoYearsAgo.toISOString().slice(0,10))
        .order('end_user', { ascending: true })
        .order('renewed_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { vendor, end_user, old_spa_number, new_spa_number, renewed_at, old_discount, new_discount, delta_items } = req.body;
      const { data, error } = await supabase
        .from('spa_history')
        .insert([{ vendor, end_user, old_spa_number, new_spa_number, renewed_at, old_discount, new_discount, delta_items }])
        .select();
      if (error) throw error;
      return res.status(201).json(data[0]);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
