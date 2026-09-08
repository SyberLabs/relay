import { expect, test } from '@playwright/test';

type TrackRace = {
  held: boolean;
  finished: boolean;
  unauthorizedJsonReads: number;
  release: () => void;
};

for (const unauthorized of ['outcomes', 'workspace']) {
  for (const heldAt of ['fetch', 'json']) {
    test(`Track clears private content on ${unauthorized} 401 before sibling ${heldAt} completes`, async ({
      page,
    }) => {
      let refreshing = false;
      let releaseDenial!: () => void;
      const denial = new Promise<void>((resolve) => {
        releaseDenial = resolve;
      });
      const job = {
        id: 'fictional-track-job',
        name: 'Private Example — Track Engineer',
        status: 'Ready',
        version: 1,
        receipt: null,
        claims: [
          {
            id: 'fictional-claim',
            claim: 'Private fictional claim',
            evidence: 'Fictional evidence',
          },
        ],
      };
      await page.route('**/api/{outcomes,workspace}', async (route) => {
        if (route.request().method() === 'POST') {
          refreshing = true;
          await route.fulfill({ json: { ok: true } });
          return;
        }
        const endpoint = new URL(route.request().url()).pathname;
        if (refreshing && endpoint === `/api/${unauthorized}`) {
          await denial;
          await route.fulfill({ status: 401, body: 'Unauthorized' });
          return;
        }
        await route.fulfill({
          json:
            endpoint === '/api/workspace'
              ? { jobs: [job] }
              : {
                  prep: [job],
                  rates: {},
                  outcomes: [
                    {
                      id: 'fictional-outcome',
                      kind: 'submitted',
                      receipt: 'Private fictional history receipt',
                      occurred: '2026-09-07T12:00:00.000Z',
                    },
                  ],
                },
        });
      });
      await page.goto('/track');
      await expect(
        page.getByText('Private fictional claim', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('receipt: Private fictional history receipt'),
      ).toBeVisible();
      await page
        .getByRole('textbox', { name: 'Submission receipt' })
        .fill('Private typed receipt');
      await page.evaluate(
        ({ unauthorized, heldAt }) => {
          const original = window.fetch.bind(window);
          let release!: () => void;
          const gate = new Promise<void>((resolve) => {
            release = resolve;
          });
          const control: TrackRace = {
            held: false,
            finished: false,
            unauthorizedJsonReads: 0,
            release,
          };
          (window as unknown as { trackRace: TrackRace }).trackRace = control;
          window.fetch = async (...args) => {
            const response = await original(...args);
            if (args[1]?.method === 'POST') return response;
            if (response.status === 401) {
              response.json = async () => {
                control.unauthorizedJsonReads++;
                throw Error('Unauthorized response must not be parsed');
              };
            } else if (
              args[0] ===
              `/api/${unauthorized === 'outcomes' ? 'workspace' : 'outcomes'}`
            ) {
              const hold = async () => {
                control.held = true;
                await gate;
                control.finished = true;
              };
              if (heldAt === 'fetch') await hold();
              else {
                const json = response.json.bind(response);
                response.json = async () => {
                  await hold();
                  return json();
                };
              }
            }
            return response;
          };
        },
        { unauthorized, heldAt },
      );
      try {
        await page.getByRole('button', { name: 'Record submission' }).click();
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                (window as unknown as { trackRace: TrackRace }).trackRace.held,
            ),
          )
          .toBe(true);
        releaseDenial();
        await expect(
          page.getByText('Sign in to see your live applications.'),
        ).toBeVisible();
        await expect(
          page.getByText(/Private Example|Private fictional/),
        ).toHaveCount(0);
        await expect(
          page.getByRole('textbox', { name: 'Submission receipt' }),
        ).toHaveCount(0);
        expect(
          await page.evaluate(
            () =>
              (window as unknown as { trackRace: TrackRace }).trackRace
                .finished,
          ),
        ).toBe(false);
        await page.evaluate(async () => {
          (window as unknown as { trackRace: TrackRace }).trackRace.release();
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        });
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                (window as unknown as { trackRace: TrackRace }).trackRace
                  .finished,
            ),
          )
          .toBe(true);
        await expect(
          page.getByText(
            /Private Example|Private fictional|Recorded the submission/,
          ),
        ).toHaveCount(0);
        await expect(
          page.getByText('Sign in to see your live applications.'),
        ).toBeVisible();
        expect(
          await page.evaluate(
            () =>
              (window as unknown as { trackRace: TrackRace }).trackRace
                .unauthorizedJsonReads,
          ),
        ).toBe(0);
      } finally {
        releaseDenial();
        await page.evaluate(() =>
          (window as unknown as { trackRace: TrackRace }).trackRace.release(),
        );
      }
    });
  }
}
