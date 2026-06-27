export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = getAllowedOrigins(env);
    console.log('[submit] origin:', origin, '| allowedOrigins:', allowedOrigins);

    if (allowedOrigins.length && !allowedOrigins.includes(origin)) {
      console.log('[submit] ORIGEN_NO_PERMITIDO');
      return json({ ok: false, error: 'ORIGEN_NO_PERMITIDO' }, 403);
    }

    
    const contentLength = Number(request.headers.get('Content-Length') || 0);
    console.log('[submit] contentLength:', contentLength);

    if (contentLength > 20000) {
      console.log('[submit] PAYLOAD_DEMASIADO_GRANDE');
      return json({ ok: false, error: 'PAYLOAD_DEMASIADO_GRANDE' }, 413);
    }

    if (!env.GOOGLE_SCRIPT_URL || !env.FORM_TOKEN) {
      console.log('[submit] CONFIGURACION_INCOMPLETA — GOOGLE_SCRIPT_URL:', !!env.GOOGLE_SCRIPT_URL, '| FORM_TOKEN:', !!env.FORM_TOKEN);
      return json({ ok: false, error: 'CONFIGURACION_INCOMPLETA' }, 500);
    }

    const payload = await request.json();
    console.log('[submit] payload:', JSON.stringify(payload));

    const validation = validatePayload(payload);
    console.log('[submit] validation:', JSON.stringify(validation));
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

    const result = await googleResponse.json();
    console.log('[submit] googleResponse.status:', googleResponse.status, '| result:', JSON.stringify(result));

    if (!googleResponse.ok || !result.ok) {
      console.log('[submit] GOOGLE_SCRIPT_ERROR');
      return json({
        ok: false,
        error: result.error || 'GOOGLE_SCRIPT_ERROR'
      }, 400);
    }

    console.log('[submit] success');
    return json({ ok: true });
  } catch (error) {
    console.log('[submit] caught error:', error?.message || error);
    return json({ ok: false, error: 'SERVER_ERROR' }, 500);
  }
}

export async function onRequestGet() {
  return json({ ok: true, message: 'Submit endpoint activo' });
}

function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
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

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}
