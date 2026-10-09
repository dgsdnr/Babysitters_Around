import crypto from 'crypto';

function getTelegramUser(initData, botToken) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  if (calc.length !== hash.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > 60 * 60 * 24) return null;

  try {
    return JSON.parse(params.get('user'));
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!shopId || !secretKey || !botToken) {
    return res.status(500).json({ ok: false, error: 'Оплата картой пока не настроена' });
  }

  const { initData, amount } = req.body || {};
  const user = getTelegramUser(initData, botToken);
  if (!user) {
    return res.status(401).json({ ok: false, error: 'Не удалось проверить пользователя' });
  }

  const sum = parseInt(amount, 10);
  if (!sum || sum < 50 || sum > 50000) {
    return res.status(400).json({ ok: false, error: 'Сумма должна быть от 50 до 50 000 ₽' });
  }

  const returnUrl = process.env.YOOKASSA_RETURN_URL || `https://${req.headers.host}/`;

  try {
    const response = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotence-Key': crypto.randomUUID(),
        Authorization: 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64')
      },
      body: JSON.stringify({
        amount: { value: sum.toFixed(2), currency: 'RUB' },
        capture: true,
        confirmation: { type: 'redirect', return_url: returnUrl },
        description: 'Поддержка проекта Babysitters Around',
        metadata: { telegram_id: String(user.id) }
      })
    });

    const data = await response.json();
    if (!response.ok || !data.confirmation?.confirmation_url) {
      console.error('YooKassa error', data);
      return res.status(502).json({ ok: false, error: data.description || 'Ошибка платёжной системы' });
    }

    return res.status(200).json({ ok: true, link: data.confirmation.confirmation_url });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'Не удалось создать платёж' });
  }
}
