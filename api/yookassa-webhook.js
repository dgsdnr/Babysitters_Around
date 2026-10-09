// Уведомление от ЮKassa об успешной оплате.
// Подлинность проверяем так: сами спрашиваем у ЮKassa статус платежа по его id.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('ok');

  try {
    const event = req.body?.event;
    const paymentId = req.body?.object?.id;
    if (event !== 'payment.succeeded' || !paymentId) return res.status(200).send('ok');

    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const adminId = process.env.ADMIN_TELEGRAM_ID;

    const check = await fetch(`https://api.yookassa.ru/v3/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64') }
    });
    const payment = await check.json();
    if (payment.status !== 'succeeded') return res.status(200).send('ok');

    const text = `💳 Новое пожертвование картой: ${payment.amount.value} ${payment.amount.currency}\nTelegram ID: ${payment.metadata?.telegram_id || '—'}`;
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: adminId, text })
    });
  } catch (e) {
    console.error(e);
  }
  return res.status(200).send('ok');
}
