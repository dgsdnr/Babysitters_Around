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

  const { initData, amount } = req.body;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  const telegramId = verifyInitData(initData, botToken);
  if (!telegramId) return res.status(401).json({ ok: false, error: 'Identity verification failed' });

  const stars = parseInt(amount, 10);
  if (!stars || stars < 1 || stars > 100000) {
    return res.status(400).json({ ok: false, error: 'Некорректная сумма' });
  }

  const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Поддержка проекта',
      description: 'Спасибо за поддержку Babysitters Around ❤️',
      payload: `donation_${telegramId}_${Date.now()}`,
      currency: 'XTR',
      prices: [{ label: 'Донат', amount: stars }]
    })
  });

  const data = await tgRes.json();
  if (!data.ok) {
    return res.status(500).json({ ok: false, error: data.description || 'Telegram error' });
  }

  return res.status(200).json({ ok: true, link: data.result });
}
