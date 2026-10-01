const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mykoshiarlfhvpvrblvi.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_WeKxOhE2HFXMPpFYcbc6rg_zChHajkK';

const ALLOWED = new Set(['CORRECT SCORE', 'HT FT', 'OVER 2.5']);

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success:false, error:'Method not allowed' });
  try {
    const q = req.query || {};
    const category = String(q.category || '').trim();
    const date = String(q.date || '').trim();

    let path = 'vip_tips?select=id,match,tip,status,date,category,created_at&order=created_at.desc';
    if (ALLOWED.has(category)) path += '&category=eq.' + encodeURIComponent(category);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) path += '&date=eq.' + encodeURIComponent(date);

    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : []; } catch (_) { data = []; }

    if (!response.ok) {
      const message = data && data.message ? data.message : `Supabase request failed (${response.status})`;
      throw new Error(message);
    }

    return res.status(200).json({ success:true, tips:Array.isArray(data)?data:[] });
  } catch (e) {
    console.error('VIP results error:', e);
    return res.status(500).json({ success:false, error:'Unable to load VIP results: ' + (e.message || 'database error') });
  }
};
