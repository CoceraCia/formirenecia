export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/debug' || url.pathname === '/api/debug/') {
      return handleDebug(request, env);
    }

    if (url.pathname === '/api/submit' || url.pathname === '/api/submit/') {
      return handleSubmit(request, env);
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ ok: false, error: 'NOT_FOUND' }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleSubmit(request, env) {
  if (request.method === 'GET') {
    return json({ ok: true, message: 'Submit endpoint activo' });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  try {
    const origin = normalizeOrigin(request.headers.get('Origin') || new URL(request.url).origin);
    const allowedOrigins = getAllowedOrigins(env);

    if (allowedOrigins.length && !allowedOrigins.includes(origin)) {
      return json({ ok: false, error: 'ORIGEN_NO_PERMITIDO', origin }, 403);
    }

    const contentLength = Number(request.headers.get('Content-Length') || 0);

    if (contentLength > 20000) {
      return json({ ok: false, error: 'PAYLOAD_DEMASIADO_GRANDE' }, 413);
    }

    if (!env.GOOGLE_SCRIPT_URL || !env.FORM_TOKEN) {
      return json({ ok: false, error: 'CONFIGURACION_INCOMPLETA' }, 500);
    }

    const payload = await request.json();
    const validation = validatePayload(payload);

    if (!validation.ok) {
      return json(validation, 400);
    }

    const googleResponse = await fetch(env.GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: JSON.stringify({
        ...payload,
        token: env.FORM_TOKEN,
        origin
      })
    });

    const result = await readJson(googleResponse);

    if (!result) {
      return json({ ok: false, error: 'GOOGLE_SCRIPT_INVALID_RESPONSE' }, 502);
    }

    if (!googleResponse.ok || !result.ok) {
      return json({
        ok: false,
        error: result.error || 'GOOGLE_SCRIPT_ERROR'
      }, 400);
    }

    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: 'SERVER_ERROR' }, 500);
  }
}

function handleDebug(request, env) {
  const origin = normalizeOrigin(request.headers.get('Origin') || new URL(request.url).origin);

  return json({
    ok: true,
    origin,
    allowedOrigins: getAllowedOrigins(env),
    hasGoogleScriptUrl: Boolean(env.GOOGLE_SCRIPT_URL),
    hasFormToken: Boolean(env.FORM_TOKEN)
  });
}

function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
}

function normalizeOrigin(origin) {
  const value = String(origin || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\/$/, '');

  if (!value) {
    return '';
  }

  try {
    return new URL(value).origin;
  } catch (error) {
    return value;
  }
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'PAYLOAD_INVALIDO' };
  }

  if (payload.website) {
    return { ok: false, error: 'BOT_DETECTADO' };
  }

  if (!payload.consent) {
    return { ok: false, error: 'FALTA_CONSENTIMIENTO' };
  }

  const requiredFields = ['name', 'age', 'attempts', 'guide', 'meaning', 'phone'];

  for (const field of requiredFields) {
    if (!String(payload[field] || '').trim()) {
      return { ok: false, error: `FALTA_${field.toUpperCase()}` };
    }
  }

  const phoneDigits = String(payload.phone || '').replace(/\D/g, '');

  if (phoneDigits.length < 8 || phoneDigits.length > 15) {
    return { ok: false, error: 'TELEFONO_INVALIDO' };
  }

  return { ok: true };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}
