import crypto from 'crypto';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { initData } = req.body;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!initData || !botToken) {
    return res.status(400).json({ ok: false, error: 'Missing initData or token' });
  }

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

  if (computedHash !== hash) {
    return res.status(401).json({ ok: false, error: 'Invalid signature' });
  }

  const authDate = parseInt(params.get('auth_date'), 10);
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > 86400) {
    return res.status(401).json({ ok: false, error: 'Data expired' });
  }

  const userJson = params.get('user');
  const user = userJson ? JSON.parse(userJson) : null;

  if (!user || !user.id) {
    return res.status(400).json({ ok: false, error: 'No user in initData' });
  }

  return res.status(200).json({ ok: true, telegramId: user.id, username: user.username || null, firstName: user.first_name || '' });
}
