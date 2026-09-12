import { optionalOriginPatterns } from './tabs.js';

export function admitStartClick(input) {
  if (
    !input.relayTabId ||
    !input.fixtureTabId ||
    !input.value ||
    !input.relayUrl ||
    !input.fixtureUrl
  )
    return {
      ok: false,
      message: 'Choose Relay, fixture, job, and a complete Full name.',
    };
  return {
    ok: true,
    origins: optionalOriginPatterns([input.relayUrl, input.fixtureUrl]),
  };
}
