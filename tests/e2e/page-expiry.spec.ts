import { expect, test, type Page } from '@playwright/test';

const unauthorized = {
  json: {
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Sign in first.' }),
  },
  plain: { contentType: 'text/plain', body: 'Unauthorized' },
} as const;

async function assertSignedOut(
  page: Page,
  heading: string,
  markers: string[],
  actions: string[],
  url: string,
) {
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Sign in with ChatGPT' }),
  ).toBeVisible();
  for (const marker of markers)
    await expect(page.getByText(marker)).toHaveCount(0);
  for (const name of actions)
    await expect(page.getByRole('button', { name })).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  expect(page.url()).toBe(url);
}

const profileGet = {
  facts: [
    {
      id: 'f1',
      claim: 'PRIVATE_PROFILE_FACT',
      evidence: 'ledger evidence',
      tag: 'role',
      status: 'Verified',
      verified: '2026-01-01T00:00:00.000Z',
      expires: null,
    },
  ],
  rules: [{ id: 'r1', rule: 'PRIVATE_PROFILE_RULE', scope: 'global' }],
  version: 3,
  usable: 1,
};

for (const [format, payload] of Object.entries(unauthorized)) {
  test(`/profile POST 401 ${format} clears private UI without reload`, async ({
    page,
  }) => {
    await page.route('**/api/profile', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: profileGet });
        return;
      }
      await route.fulfill({ status: 401, ...payload });
    });
    await page.goto('/profile');
    await expect(page.getByText('PRIVATE_PROFILE_FACT')).toBeVisible();
    await page.getByLabel('New style rule').fill('Keep openings short.');
    const url = page.url();
    await page.getByRole('button', { name: 'Add rule' }).click();
    await assertSignedOut(
      page,
      'Your profile',
      ['PRIVATE_PROFILE_FACT', 'PRIVATE_PROFILE_RULE'],
      ['Add rule'],
      url,
    );
  });

  test(`/track POST 401 ${format} clears private UI without reload`, async ({
    page,
  }) => {
    await page.route('**/api/outcomes', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            outcomes: [],
            applications: [
              {
                id: 'job-1',
                name: 'PRIVATE_TRACK_JOB',
                status: 'Ready',
                version: 2,
                receipt: null,
                accepted_draft: 'PRIVATE_TRACK_DRAFT',
              },
            ],
          },
        });
        return;
      }
      await route.fulfill({ status: 401, ...payload });
    });
    await page.route('**/api/workspace', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            viewer: 'track-expiry',
            jobs: [],
            sources: [],
            events: [],
            facts: [],
          },
        });
        return;
      }
      await route.fallback();
    });
    await page.goto('/track');
    await expect(page.getByText('PRIVATE_TRACK_JOB')).toBeVisible();
    await page.getByLabel('Submission receipt').fill('https://example.com/r1');
    const url = page.url();
    await page.getByRole('button', { name: 'Record submission' }).click();
    await assertSignedOut(
      page,
      'Track',
      ['PRIVATE_TRACK_JOB', 'PRIVATE_TRACK_DRAFT'],
      ['Record submission'],
      url,
    );
  });
}

test('/profile extract POST 401 clears resume candidates without reload', async ({
  page,
}) => {
  await page.route('**/api/profile', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { ...profileGet, rules: [] } });
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Sign in first.' }),
    });
  });
  await page.goto('/profile');
  await expect(page.getByText('PRIVATE_PROFILE_FACT')).toBeVisible();
  await page.getByLabel('Resume text').fill('PRIVATE_RESUME_TEXT');
  const url = page.url();
  await page.getByRole('button', { name: 'Extract candidate facts' }).click();
  await assertSignedOut(
    page,
    'Your profile',
    ['PRIVATE_PROFILE_FACT', 'PRIVATE_RESUME_TEXT'],
    ['Extract candidate facts'],
    url,
  );
});
