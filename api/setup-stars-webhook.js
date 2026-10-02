export default async function handler(req, res) {
  const { token } = req.query;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (token !== botToken) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const host = req.headers.host;
  const webhookUrl = `https://${host}/api/stars-webhook`;

  const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message', 'pre_checkout_query']
    })
  });

  const data = await tgRes.json();
  return res.status(200).json(data);
}
