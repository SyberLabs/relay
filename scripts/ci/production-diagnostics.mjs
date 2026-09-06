export function classifyProductionResponse(status, body) {
  const text = typeof body === 'string' ? body : '';
  const trimmed = text.trim();
  const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  if (status === 503) return looksJson ? 'application-503' : 'runtime-503';
  if (status >= 500) return looksJson ? 'application-5xx' : 'runtime-5xx';
  return looksJson ? 'application' : 'non-json';
}

export function formatHttpFailure({
  label,
  expected,
  status,
  body,
  logTail,
}) {
  const kind = classifyProductionResponse(status, body);
  const snippet = String(body || '')
    .replaceAll(/cf-access-jwt-assertion:\s*\S+/gi, 'cf-access-jwt-assertion: [redacted]')
    .slice(0, 800);
  const tail = String(logTail || '')
    .replaceAll(/cf-access-jwt-assertion:\s*\S+/gi, 'cf-access-jwt-assertion: [redacted]')
    .slice(-4000);
  return `${label}: expected ${expected}, got ${status} (${kind}). Body: ${snippet || '[empty]'}. Log tail:\n${tail || '[no captured process output]'}`;
}
