export async function relayPageFetch(path, body) {
  const origin = globalThis.location?.origin;
  if (typeof origin !== 'string' || origin.startsWith('chrome-extension:'))
    return {
      ok: false,
      status: 403,
      json: {
        error:
          'Relay APIs must be called from a signed-in Relay page, not the extension origin.',
        code: 'extension_origin',
      },
    };
  let url;
  try {
    url = new URL(path, origin);
  } catch {
    return {
      ok: false,
      status: 400,
      json: { error: 'Invalid request path.', code: 'invalid_path' },
    };
  }
  if (url.origin !== origin)
    return {
      ok: false,
      status: 403,
      json: { error: 'Invalid request origin.', code: 'cross_origin' },
    };
  const response = await fetch(url.pathname + url.search, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
    ...(body
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  });
  let json;
  try {
    json = await response.json();
  } catch {
    json = { error: 'Relay refused the request.' };
  }
  return { ok: response.ok, status: response.status, json };
}
