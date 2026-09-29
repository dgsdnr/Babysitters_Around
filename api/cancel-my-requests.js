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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const { initData, asNanny } = req.body;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL || 'https://ponyiyijmamsecgrzmsa.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const telegramId = verifyInitData(initData, botToken);
  if (!telegramId) return res.status(401).json({ ok: false, error: 'Identity verification failed' });

  const field = asNanny ? 'nanny_telegram_id' : 'parent_telegram_id';
  const url = `${supabaseUrl}/rest/v1/requests?${field}=eq.${telegramId}&status=eq.upcoming`;

  const dbRes = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`
    },
    body: JSON.stringify({ status: 'cancelled' })
  });

  if (!dbRes.ok) {
    const err = await dbRes.json();
    return res.status(500).json({ ok: false, error: err?.message });
  }

  return res.status(200).json({ ok: true });
}
