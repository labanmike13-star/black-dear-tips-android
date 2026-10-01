const { json, allowCors, supabase } = require('./_utils');

function nairobiToday() {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  return parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value+'-'+parts.find(p=>p.type==='day').value;
}

module.exports = async function handler(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return json(res,405,{success:false,error:'Method not allowed'});
  try {
    const token=String(req.query.token||'').trim();
    if(!/^[a-f0-9]{64}$/.test(token)) return json(res,400,{success:false,error:'Invalid access token.'});
    const rows=await supabase(`vip_payments?select=reference,plan_name,vip_expires_at,status&access_token=eq.${encodeURIComponent(token)}&limit=1`);
    const access=Array.isArray(rows)?rows[0]:null;
    if(!access||access.status!=='success'||!access.vip_expires_at||new Date(access.vip_expires_at).getTime()<=Date.now()) return json(res,403,{success:false,error:'VIP access is not active or has expired.'});
    const category=String(req.query.category||'').toUpperCase();
    let path=`vip_tips?select=id,match,tip,status,date,category,created_at&date=eq.${nairobiToday()}&order=created_at.desc`;
    if(['CORRECT SCORE','HT FT','OVER 2.5'].includes(category)) path += '&category=eq.'+encodeURIComponent(category);
    const tips=await supabase(path);
    return json(res,200,{success:true,plan:access.plan_name,expiresAt:access.vip_expires_at,tips:Array.isArray(tips)?tips:[]});
  } catch(error){ console.error('VIP access error:',error); return json(res,500,{success:false,error:'Unable to load today\'s VIP content: '+(error.message||'database error')}); }
};
