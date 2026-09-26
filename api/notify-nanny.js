export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { nannyTelegramId, parentName, childInfo, date, timeInfo, city, workFormat, message, appUrl } = req.body;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ error: 'Bot token not configured' });
  }

  const dateFormatted = new Date(date).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long'
  });

  let text = `Новая заявка от ${parentName || 'родителя'}\n`;
  if (childInfo) text += `👧 ${childInfo}\n`;
  text += `📅 ${dateFormatted}\n`;
  if (timeInfo) text += `🕐 ${timeInfo}\n`;
  if (city) text += `📍 ${city}\n`;
  if (workFormat) text += `🏠 ${workFormat}\n`;
  if (message) text += `\n${message}`;

  const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: nannyTelegramId,
      text: text,
      reply_markup: {
        inline_keyboard: [[
          { text: 'Открыть заявку', url: appUrl }
        ]]
      }
    })
  });

  const result = await telegramRes.json();

  if (!result.ok) {
    return res.status(500).json({ error: result.description || 'Telegram API error' });
  }

  return res.status(200).json({ success: true });
}
