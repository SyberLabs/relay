export function inspectFixtureTab(destination) {
  const url = location.href.split('#')[0];
  if (
    typeof destination !== 'string' ||
    destination.length === 0 ||
    url !== destination
  )
    return {
      ok: false,
      code: 'wrong_host',
      error: 'Fixture tab URL does not match the armed destination.',
    };
  const button = [...document.querySelectorAll('button')].find((node) =>
    /Submit fictional application/i.test(node.textContent || ''),
  );
  if (!button)
    return {
      ok: false,
      code: 'not_fixture',
      error: 'Fixture submit control not found.',
    };
  return { ok: true };
}

export function fillFixtureFields(fields) {
  const list = typeof fields === 'string' ? JSON.parse(fields) : fields;
  for (const field of list) {
    const labels = [...document.querySelectorAll('label')];
    const label = labels.find((node) =>
      (node.textContent || '').includes(field.label),
    );
    let input = label?.querySelector('input, textarea, select');
    if (!input && label?.getAttribute('for'))
      input = document.getElementById(label.getAttribute('for'));
    if (!input) return { ok: false, error: `Missing field ${field.label}` };
    input.value = field.value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return { ok: true };
}

export function clickFixtureSubmit() {
  const button = [...document.querySelectorAll('button')].find((node) =>
    /Submit fictional application/i.test(node.textContent || ''),
  );
  if (!button) return { ok: false, error: 'Fixture submit control not found.' };
  button.click();
  return { ok: true };
}

export function readFixtureReceipt() {
  const text =
    document
      .querySelector('[data-relay-fixture-receipt]')
      ?.textContent?.trim() || '';
  return text || null;
}
