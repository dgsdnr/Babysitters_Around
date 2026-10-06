export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, nannyTelegramId, parentName, childInfo, date, dates, timeInfo, city, workFormat, message, appUrl, reporterName, reporterRole, situationText } = req.body;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ error: 'Bot token not configured' });
  }

  let chatId, text, replyMarkup;

  if (type === 'admin_report') {
    chatId = process.env.ADMIN_TELEGRAM_ID;
    text = `⚠️ Отчёт «Другое» по заявке\nОт: ${reporterName || 'пользователь'} (${reporterRole === 'parent' ? 'родитель' : 'няня'})\n\n${situationText || 'без описания'}`;
    replyMarkup = undefined;
  } else if (type === 'multi_date_request') {
    chatId = nannyTelegramId;
    const datesFormatted = (dates || []).map(d =>
      new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    ).join(', ');
    text = `Новая заявка от ${parentName || 'родителя'}\n`;
    if (childInfo) text += `👧 Возраст: ${childInfo}\n`;
    text += `📅 Даты: ${datesFormatted}\n`;
    if (timeInfo) text += `🕐 ${timeInfo}\n`;
    if (city) text += `📍 ${city}\n`;
    if (workFormat) text += `🏠 ${workFormat}\n`;
    replyMarkup = { inline_keyboard: [[{ text: 'Открыть заявку', web_app: { url: appUrl } }]] };
  } else {
    chatId = nannyTelegramId;
    const dateFormatted = new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    text = `Новая заявка от ${parentName || 'родителя'}\n`;
    if (childInfo) text += `👧 ${childInfo}\n`;
    text += `📅 ${dateFormatted}\n`;
    if (timeInfo) text += `🕐 ${timeInfo}\n`;
    if (city) text += `📍 ${city}\n`;
    if (workFormat) text += `🏠 ${workFormat}\n`;
    if (message) text += `\n${message}`;
    replyMarkup = { inline_keyboard: [[{ text: 'Открыть заявку', web_app: { url: appUrl } }]] };
  }

  const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {})
    })
  });
  
  const result = await telegramRes.json();

  if (!result.ok) {
    return res.status(500).json({ error: result.description || 'Telegram API error' });
  }

  return res.status(200).json({ success: true });
}
