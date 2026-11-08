export async function deliverAlert(text: string): Promise<{ telegramOk: boolean; webhookOk: boolean }> {
  const [telegramOk, webhookOk] = await Promise.all([sendTelegram(text), sendWebhook(text)]);
  return { telegramOk, webhookOk };
}

async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim() ?? "";
  if (!token || !chatId) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 500) }),
      signal: AbortSignal.timeout(4000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function sendWebhook(text: string) {
  const url = process.env.ALERT_WEBHOOK_URL?.trim() ?? "";
  if (!url) return false;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, at: new Date().toISOString() }),
      signal: AbortSignal.timeout(4000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
