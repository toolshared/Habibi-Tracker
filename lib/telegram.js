const BOT_TOKEN = process.env.BOT_TOKEN;

function splitMessage(text, maxLen) {
    if (text.length <= maxLen) return [text];
    const parts = [];
    let remaining = text;
    while (remaining.length > maxLen) {
          let cut = remaining.lastIndexOf('\n', maxLen);
          if (cut <= 0) cut = maxLen;
          parts.push(remaining.slice(0, cut));
          remaining = remaining.slice(cut);
    }
    if (remaining.length) parts.push(remaining);
    return parts;
}

// Reintenta respetando lo que Telegram pida esperar (rate limiting real, codigo 429),
// hasta 3 veces, con un tope de 10s por espera para nunca quedarse colgado mucho tiempo.
async function intentarEnviar(chatId, chunk, intento) {
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: chunk })
    });
    if (resp.status === 200) return;

  const errData = await resp.json().catch(() => ({}));
    console.error(`Telegram rechazo el mensaje (intento ${intento + 1}):`, JSON.stringify(errData));
    if (intento >= 3) return;

  let espera = 1;
    if (errData.parameters && errData.parameters.retry_after) {
          espera = Math.min(errData.parameters.retry_after, 10);
    }
    await new Promise(r => setTimeout(r, espera * 1000));
    await intentarEnviar(chatId, chunk, intento + 1);
}

async function enviarTelegram(chatId, text) {
    if (!BOT_TOKEN || !chatId) return;
    const chunks = splitMessage(text, 3500);
    for (const chunk of chunks) {
          await intentarEnviar(chatId, chunk, 0);
    }
}

async function enviarAccionEscribiendo(chatId) {
    if (!BOT_TOKEN || !chatId) return;
    try {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chat_id: chatId, action: 'typing' })
          });
    } catch (e) { /* no es critico si esto falla */ }
}

module.exports = { enviarTelegram, enviarAccionEscribiendo };
