import type { Page } from '@playwright/test';

export async function openDraftTools(page: Page) {
  const tools = page.locator('details.draft-tools');
  if ((await tools.count()) === 0) return;
  if ((await tools.getAttribute('open')) !== null) return;
  await tools.locator(':scope > summary').click();
}
