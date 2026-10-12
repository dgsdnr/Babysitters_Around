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

    // requests: обновлять может только участник заявки, и только разрешённые поля
  if (table === 'requests' && action === 'update') {
    if (matchField !== 'id' || matchValue === undefined || !values) {
      return res.status(400).json({ ok: false, error: 'Bad request' });
    }
    const rowRes = await fetch(
      `${supabaseUrl}/rest/v1/requests?select=*&id=eq.${encodeURIComponent(String(matchValue))}&limit=1`,
      { headers }
    );
    const rows = await rowRes.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) {
      return res.status(404).json({ ok: false, error: 'Заявка не найдена' });
    }
    const isParentSide = String(row.parent_telegram_id) === String(telegramId);
    const isNannySide = String(row.nanny_telegram_id) === String(telegramId);
    if (!isParentSide && !isNannySide) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const clean = {};

    if ('nanny_seen' in values) {
      if (!isNannySide) return res.status(403).json({ ok: false, error: 'Forbidden' });
      clean.nanny_seen = !!values.nanny_seen;
    }

    if (values.status === 'cancelled') {
      if (!isParentSide) return res.status(403).json({ ok: false, error: 'Forbidden' });
      if (row.status !== 'upcoming') {
        return res.status(409).json({ ok: false, error: 'Эту заявку уже нельзя отменить' });
      }
      clean.status = 'cancelled';
    }

    // ответ на вопрос «Встреча состоялась?» — у каждой стороны свой
    if (values.meeting_answer) {
      if (!['yes', 'no', 'other'].includes(values.meeting_answer)) {
        return res.status(400).json({ ok: false, error: 'Bad answer' });
      }
      const col = isParentSide ? 'parent_answer' : 'nanny_answer';
      if (row[col]) {
        return res.status(409).json({ ok: false, error: 'Вы уже ответили на этот вопрос' });
      }
      clean[col] = values.meeting_answer;
      clean.meeting_happened = values.meeting_answer;
      if (typeof values.message === 'string') clean.message = values.message.slice(0, 2000);

      const p = isParentSide ? values.meeting_answer : row.parent_answer;
      const n = isNannySide ? values.meeting_answer : row.nanny_answer;
      if (p && n) {
        if (p === 'yes' && n === 'yes') clean.status = 'completed';
        else if (p === 'no' && n === 'no') clean.status = 'not_happened';
        else clean.status = 'reported_other';
      }
    }

    // клиент не может подсунуть никаких других полей
    Object.keys(values).forEach(k => delete values[k]);
    Object.assign(values, clean);
    if (Object.keys(values).length === 0) {
      return res.status(400).json({ ok: false, error: 'Nothing to update' });
    }
  }

    // requests: нельзя создать вторую активную заявку той же няне
  if (table === 'requests' && action === 'insert') {
    if (!values || values.parent_telegram_id !== telegramId || !values.nanny_telegram_id) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Belgrade' });
    const checkUrl = `${supabaseUrl}/rest/v1/requests?select=id`
      + `&parent_telegram_id=eq.${encodeURIComponent(String(telegramId))}`
      + `&nanny_telegram_id=eq.${encodeURIComponent(String(values.nanny_telegram_id))}`
      + `&status=eq.upcoming&date=gte.${today}&limit=1`;
    const checkRes = await fetch(checkUrl, { headers });
    const existing = await checkRes.json();
    if (!checkRes.ok) {
      return res.status(500).json({ ok: false, error: 'Не удалось проверить заявки. Попробуйте ещё раз.' });
    }
    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(409).json({
        ok: false,
        error: 'У вас уже есть активная заявка этой няне. Откройте «Мои заявки» или отмените её, чтобы создать новую.'
      });
    }
  }

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
