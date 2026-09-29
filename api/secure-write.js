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

  const authDate = parseInt(params.get('auth_date'), 10);
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > 86400) return null;

  const userJson = params.get('user');
  const user = userJson ? JSON.parse(userJson) : null;
  return user && user.id ? user.id : null;
}

// Таблицы, где запись разрешена только "владельцу" строки (по этому полю)
const OWNER_FIELD = {
  users: 'telegram_id',
  nanny_profiles: 'telegram_id',
  availability: 'telegram_id'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { initData, table, action, values, matchField, matchValue } = req.body;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL || 'https://ponyiyijmamsecgrzmsa.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const telegramId = verifyInitData(initData, botToken);
  if (!telegramId) {
    return res.status(401).json({ ok: false, error: 'Identity verification failed' });
  }

  const allowedTables = ['users', 'nanny_profiles', 'availability', 'requests', 'reviews'];
  if (!allowedTables.includes(table)) {
    return res.status(400).json({ ok: false, error: 'Table not allowed' });
  }

  // Проверка владения: для таблиц из OWNER_FIELD запись должна принадлежать этому telegram_id
  const ownerField = OWNER_FIELD[table];
  if (ownerField) {
    if (values && values[ownerField] && values[ownerField] !== telegramId) {
      return res.status(403).json({ ok: false, error: 'Forbidden: not your data' });
    }
    if (matchField === ownerField && matchValue !== telegramId) {
      return res.status(403).json({ ok: false, error: 'Forbidden: not your data' });
    }
  }

  // requests: разрешаем UPDATE только если ты — родитель или няня этой заявки (проверяем ниже отдельно)
  // reviews: разрешаем INSERT только от своего имени (author_telegram_id)
  if (table === 'reviews' && action === 'insert' && values?.author_telegram_id !== telegramId) {
    return res.status(403).json({ ok: false, error: 'Forbidden: cannot post review as someone else' });
  }
  if (table === 'requests' && values?.parent_telegram_id && values.parent_telegram_id !== telegramId) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }

  const headers = {
    'Content-Type': 'application/json',
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Prefer: 'return=representation'
  };

  let url = `${supabaseUrl}/rest/v1/${table}`;
  let method, body;

  if (action === 'insert') {
    method = 'POST';
    body = JSON.stringify(values);
  } else if (action === 'update') {
    if (!matchField || matchValue === undefined) {
      return res.status(400).json({ ok: false, error: 'Missing match field for update' });
    }
    method = 'PATCH';
    url += `?${matchField}=eq.${matchValue}`;
    if (table === 'availability' && values.date) {
      url += `&date=eq.${values.date}`;
    }
    body = JSON.stringify(values);
  } else if (action === 'delete') {
    if (table !== 'availability' && table !== 'nanny_profiles') {
      return res.status(403).json({ ok: false, error: 'Delete not allowed for this table' });
    }
    if (!matchField || matchValue === undefined) {
      return res.status(400).json({ ok: false, error: 'Missing match field for delete' });
    }
    method = 'DELETE';
    url += `?${matchField}=eq.${matchValue}`;
    if (req.body.extraMatchField) {
      url += `&${req.body.extraMatchField}=eq.${req.body.extraMatchValue}`;
    }
  } else {
    return res.status(400).json({ ok: false, error: 'Unknown action' });
  }

  const dbRes = await fetch(url, { method, headers, body });
  const result = await dbRes.json();

  if (!dbRes.ok) {
    return res.status(500).json({ ok: false, error: result?.message || 'Database error' });
  }

  return res.status(200).json({ ok: true, data: Array.isArray(result) ? result[0] : result });
}
