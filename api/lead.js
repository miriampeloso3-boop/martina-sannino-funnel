const crypto = require('crypto');

const PIXEL_ID = '1076662848396023';
const GRAPH_VERSION = 'v21.0';

function sha256(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

function normalizePhone(phone) {
  return String(phone || '').replace(/[^\d]/g, '');
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach(function (pair) {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    cookies[k] = v;
  });
  return cookies;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;

  if (!ACCESS_TOKEN) {
    res.status(200).json({ ok: false, reason: 'missing_token' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { email, phone, eventId, eventSourceUrl } = body;

    const cookies = parseCookies(req.headers.cookie);
    const fbp = cookies._fbp;
    const fbc = cookies._fbc;

    const forwardedFor = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const clientIp = forwardedFor || (req.socket && req.socket.remoteAddress);
    const userAgent = req.headers['user-agent'];

    const userData = {
      em: email ? [sha256(email)] : undefined,
      ph: phone ? [sha256(normalizePhone(phone))] : undefined,
      client_ip_address: clientIp || undefined,
      client_user_agent: userAgent || undefined,
      fbp: fbp || undefined,
      fbc: fbc || undefined,
    };
    Object.keys(userData).forEach(function (k) {
      if (userData[k] === undefined) delete userData[k];
    });

    const payload = {
      data: [
        {
          event_name: 'Lead',
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          event_source_url: eventSourceUrl,
          action_source: 'website',
          user_data: userData,
        },
      ],
    };

    const metaRes = await fetch(
      'https://graph.facebook.com/' + GRAPH_VERSION + '/' + PIXEL_ID + '/events?access_token=' + encodeURIComponent(ACCESS_TOKEN),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    const result = await metaRes.json();

    if (!metaRes.ok) {
      console.error('Meta CAPI error', result);
      res.status(200).json({ ok: false, meta: result });
      return;
    }

    res.status(200).json({ ok: true, meta: result });
  } catch (err) {
    console.error('CAPI handler error', err);
    res.status(200).json({ ok: false, error: String(err) });
  }
};
