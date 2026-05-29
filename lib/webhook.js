const crypto = require('crypto');
const prisma = require('./prisma');

async function dispatch(event, payload) {
  let webhooks;
  try {
    webhooks = await prisma.webhook.findMany({ where: { active: true } });
  } catch {
    return; // DB not ready yet — ignore
  }

  for (const wh of webhooks) {
    const events = Array.isArray(wh.events) ? wh.events : [];
    if (!events.includes(event) && !events.includes('*')) continue;

    const body = JSON.stringify({
      event,
      payload,
      timestamp: new Date().toISOString()
    });

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'SinoTrack-GPS-Server/2.0',
      'X-SinoTrack-Event': event
    };

    if (wh.secret) {
      const sig = crypto.createHmac('sha256', wh.secret).update(body).digest('hex');
      headers['X-SinoTrack-Signature'] = `sha256=${sig}`;
    }

    fetch(wh.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) })
      .catch(e => console.error(`[Webhook] ${wh.name} (${wh.url}) → ${e.message}`));
  }
}

module.exports = { dispatch };
