import type { Page } from '@playwright/test';

export async function openDraftTools(page: Page) {
  const tools = page.locator('details.draft-tools');
  await tools.waitFor({ state: 'visible' });
  if ((await tools.getAttribute('open')) !== null) return;
  await tools.locator(':scope > summary').click();
}

export async function openDraftNested(page: Page, summary: string) {
  await openDraftTools(page);
  const panel = page.locator('details.draft-tools details').filter({
    has: page.locator(':scope > summary', { hasText: summary }),
  });
  await panel.waitFor({ state: 'visible' });
  if ((await panel.getAttribute('open')) === null)
    await panel.locator(':scope > summary').click();
}
