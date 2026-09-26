import { expect, test } from '@playwright/test';
import { openDraftNested, openDraftTools } from './open-draft-tools';

test('pilot navigation keeps confirmed facts, exact review and history visible', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  await expect(
    page.getByRole('link', { name: 'Tracker', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Tracker', exact: true }).click();
  const sidebar = page.locator('aside.sidebar');
  await expect(sidebar.getByRole('group', { name: 'Outcomes' })).toBeVisible();
  await expect(
    sidebar.getByRole('group', { name: 'Reusable context' }),
  ).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Your facts' })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Tracker' })).toBeVisible();
  await expect(sidebar.getByRole('group', { name: 'Job list' })).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: 'Advanced' })).toHaveCount(0);

  const profileLoaded = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/profile') &&
      response.request().method() === 'GET' &&
      response.ok(),
  );
  await sidebar.getByRole('link', { name: 'Your facts' }).click();
  await expect(
    page.getByText(/does not independently verify facts/),
  ).toBeVisible();
  await expect(page.getByText('Profile version')).toBeVisible();
  const claim = 'Built a fictional inventory service for Larch Example';
  const resume = page.getByRole('textbox', { name: 'Resume text' });
  await expect(resume).toBeVisible();
  await profileLoaded;
  await resume.fill(claim);
  await expect(resume).toHaveValue(claim);
  await expect(
    page.getByRole('button', { name: 'Extract candidate facts' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Extract candidate facts' }).click();
  await page.getByRole('button', { name: 'Add 1 to ledger' }).click();
  const factRow = page.locator('article.factrow').filter({ hasText: claim });
  await factRow
    .getByRole('button', { name: 'Confirm fact', exact: true })
    .click();
  await expect(
    page.getByText('Confirmed by you. This fact may now be included in an assistant handoff.'),
  ).toBeVisible();
  await sidebar.getByRole('link', { name: 'Runtime', exact: true }).click();
  await page
    .getByRole('button', { name: 'Import research', exact: true })
    .click();
  const rows = [
    {
      url: 'https://example.com/research/pilot-trust',
      Name: 'Larch Example — Pilot Engineer',
      Job: 'https://example.com/jobs/pilot-trust',
      Status: 'Held',
      Notes:
        'Requirements:\nInventory service experience\nMinimum marine navigation experience',
    },
  ];
  await page
    .getByRole('textbox', { name: 'Research JSON' })
    .fill(JSON.stringify(rows));
  await page.getByRole('button', { name: 'Preview matches' }).click();
  await expect(
    page.getByText('Preview complete. No records were imported.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Import into workspace' }).click();
  await page
    .getByRole('button', { name: /Larch Example — Pilot Engineer/ })
    .click();
  await openDraftTools(page);
  await openDraftNested(page, 'Posting comparison');
  await expect(
    page.getByText('Posting comparison', { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.gates').getByText('Possible evidence', { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator('.gates')
      .getByText('No matching evidence found', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/These do not pick this job/),
  ).toBeVisible();
  const editor = page.getByRole('textbox', {
    name: 'Application answer or outreach draft',
  });
  const draft = 'I built a fictional inventory service for Larch Example.';
  await editor.fill(draft);
  await expect(
    page.getByText(/Check each claim against your evidence/),
  ).toBeVisible();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'Tracker', exact: true }).click();
  await expect(editor).toHaveValue(draft);
  await page.getByRole('button', { name: 'Accept exact draft' }).click();
  await expect(
    page.getByText('Saved. Your review is preserved.'),
  ).toBeVisible();
  await expect(editor).toHaveValue(draft);
  await expect(
    page.getByRole('button', { name: 'Accept exact draft' }),
  ).toBeDisabled();
  await openDraftNested(page, 'Your review history');
  await expect(
    page.getByText('Your review history', { exact: true }),
  ).toBeVisible();
  await openDraftNested(page, 'Source history');
  await expect(page.getByText('Source history', { exact: true })).toBeVisible();
  await editor.fill(draft + ' Thank you for considering my application.');
  await expect(
    page.getByRole('button', { name: 'Accept exact draft' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Accept exact draft' }).click();
  await expect(
    page.getByRole('button', { name: 'Accept exact draft' }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Larch Example — Pilot Engineer' }),
  ).toBeVisible();
  await openDraftTools(page);
  await expect(editor).toHaveValue(
    draft + ' Thank you for considering my application.',
  );
  await page.getByRole('link', { name: 'Tracker', exact: true }).click();
  await sidebar.getByRole('link', { name: 'Your facts' }).click();
  await expect(
    page.locator('article.factrow').filter({ hasText: claim }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('a.backlink').filter({ hasText: 'Runtime' }).click();
  await expect(page).toHaveURL(/\/(\?.*)?$/);
  await expect(
    page.locator('aside.bar-nav').getByRole('link', { name: 'Tracker' }),
  ).toBeVisible();
  await page
    .locator('aside.bar-nav')
    .getByRole('link', { name: 'Tracker' })
    .click();
  await expect(page).toHaveURL(/\/track/);
});
