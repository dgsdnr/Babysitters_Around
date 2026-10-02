export default async function handler(req, res) {
  const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
  if (secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const update = req.body;

  if (update.pre_checkout_query) {
    await fetch(`https://api.telegram.org/bot${botToken}/answerPreCheckoutQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pre_checkout_query_id: update.pre_checkout_query.id, ok: true })
    });
    return res.status(200).json({ ok: true });
  }

  if (update.message?.successful_payment) {
    const payment = update.message.successful_payment;
    const fromUser = update.message.from;
    const adminId = process.env.ADMIN_TELEGRAM_ID;

    if (adminId) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: adminId,
          text: `⭐ Новый донат: ${payment.total_amount} Stars\nОт: ${fromUser.first_name || 'пользователь'} (id ${fromUser.id})`
        })
      });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({ ok: true });
}
