import crypto from 'crypto';

function verifyInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  const dataCheckArr = [];
  for (const [key, value] of [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    dataCheckArr.push(`${key}=${value}`);
  }
  const dataCheckString = dataCheckArr.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (computedHash !== hash) return null;
  const userJson = params.get('user');
  const user = userJson ? JSON.parse(userJson) : null;
  return user && user.id ? user.id : null;
}

async function sbGet(supabaseUrl, serviceKey, path) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  });
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const { initData, type, params } = req.body;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL || 'https://ponyiyijmamsecgrzmsa.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const telegramId = verifyInitData(initData, botToken);
  if (!telegramId) return res.status(401).json({ ok: false, error: 'Identity verification failed' });

  try {
    if (type === 'own-user') {
      const rows = await sbGet(supabaseUrl, serviceKey, `users?telegram_id=eq.${telegramId}`);
      return res.status(200).json({ ok: true, data: rows[0] || null });
    }

    if (type === 'own-nanny-profile') {
      const rows = await sbGet(supabaseUrl, serviceKey, `nanny_profiles?telegram_id=eq.${telegramId}`);
      return res.status(200).json({ ok: true, data: rows[0] || null });
    }

    if (type === 'public-users') {
      const ids = (params?.ids || []).join(',');
      if (!ids) return res.status(200).json({ ok: true, data: [] });
      const rows = await sbGet(supabaseUrl, serviceKey, `users?telegram_id=in.(${ids})&select=telegram_id,name,city,avatar_url,username,is_deleted,role`);
      return res.status(200).json({ ok: true, data: rows });
    }

    if (type === 'my-requests') {
      const rows = await sbGet(supabaseUrl, serviceKey, `requests?or=(parent_telegram_id.eq.${telegramId},nanny_telegram_id.eq.${telegramId})&order=date.asc`);
      return res.status(200).json({ ok: true, data: rows });
    }

    if (type === 'request-detail') {
      const rows = await sbGet(supabaseUrl, serviceKey, `requests?id=eq.${params.id}`);
      const r = rows[0];
      if (!r || (r.parent_telegram_id !== telegramId && r.nanny_telegram_id !== telegramId)) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
      return res.status(200).json({ ok: true, data: r });
    }

    return res.status(400).json({ ok: false, error: 'Unknown type' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
