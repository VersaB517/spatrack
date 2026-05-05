import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('margins').select('*');
      if (error) throw error;
      // Convert array to { endUser: margin } object
      const result = {};
      data.forEach(row => { result[row.end_user] = row.margin; });
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      // Upsert a margin for an end user
      const { end_user, margin } = req.body;
      const { data, error } = await supabase
        .from('margins')
        .upsert([{ end_user, margin }], { onConflict: 'end_user' })
        .select();
      if (error) throw error;
      return res.status(200).json(data[0]);
    }

    if (req.method === 'DELETE') {
      const { end_user } = req.query;
      const { error } = await supabase.from('margins').delete().eq('end_user', end_user);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
