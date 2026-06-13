const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./_auth');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req, res))) return;
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('spas').select('*').order('expiration', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { vendor, end_user, spa_number, discount, expiration, category, items, renewal_status, doc_url, renewal_requested } = req.body;
      const { data, error } = await supabase.from('spas').insert([{ vendor, end_user, spa_number, discount, expiration, category, items, renewal_status: renewal_status||null, doc_url: doc_url||null, renewal_requested: renewal_requested||false }]).select();
      if (error) throw error;
      return res.status(201).json(data[0]);
    }
    if (req.method === 'PUT') {
      const { id, vendor, end_user, spa_number, discount, expiration, category, items, renewal_status, doc_url, renewal_requested } = req.body;
      const { data, error } = await supabase.from('spas').update({ vendor, end_user, spa_number, discount, expiration, category, items, renewal_status: renewal_status||null, doc_url: doc_url||null, renewal_requested: renewal_requested||false }).eq('id', id).select();
      if (error) throw error;
      return res.status(200).json(data[0]);
    }
    if (req.method === 'DELETE') {
      const { id } = req.query;
      const { error } = await supabase.from('spas').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
