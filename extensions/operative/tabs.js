export function hostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function isRelayUrl(url) {
  const host = hostname(url);
  return (
    host === '127.0.0.1' ||
    host === 'localhost' ||
    host.endsWith('.workers.dev')
  );
}

export function isFixtureUrl(url) {
  return Boolean(url) && !url.startsWith('chrome') && !isRelayUrl(url);
}

export function originPattern(url) {
  return `${new URL(url).origin}/*`;
}

export function isInstallGrantedOrigin(origin) {
  return (
    origin.startsWith('http://127.0.0.1') ||
    origin.startsWith('http://localhost')
  );
}

export function optionalOriginPatterns(urls) {
  const patterns = [];
  for (const url of urls) {
    if (!url) continue;
    const origin = new URL(url).origin;
    if (isInstallGrantedOrigin(origin)) continue;
    const pattern = `${origin}/*`;
    if (!patterns.includes(pattern)) patterns.push(pattern);
  }
  return patterns;
}
