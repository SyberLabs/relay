import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    relayTestActiveTools: Set<string>;
    relay?: Record<string, (input: Record<string, unknown>) => Promise<unknown>>;
  }
}

const TOOL_NAMES = [
  'relay_read_application',
  'relay_read_workspace',
  'relay_read_profile',
  'relay_review_status',
  'relay_preview_import',
  'relay_log_draft',
  'relay_save_progress',
  'relay_stage_draft',
  'relay_prepare_application',
  'relay_arm_application',
  'relay_inspect_application',
  'relay_begin_application',
  'relay_finish_application',
  'relay_cancel_application',
] as const;

async function relayNames(page: {
  evaluate: (fn: () => string[]) => Promise<string[]>;
}) {
  return page.evaluate(() => Object.keys(window.relay || {}));
}

for (const mode of ['unavailable', 'registered', 'throw', 'reject'] as const) {
  test(`browser assistant tool registration: ${mode}`, async ({ page }) => {
    // This host fixture exercises registration, not Grok tool discovery.
    await page.addInitScript((mode) => {
      const active = new Set<string>();
      Object.assign(window, { relayTestActiveTools: active });
      Object.defineProperty(document, 'modelContext', {
        configurable: true,
        value:
          mode === 'unavailable'
            ? undefined
            : {
                registerTool(
                  tool: { name: string },
                  { signal }: { signal: AbortSignal },
                ) {
                  if (tool.name === 'relay_stage_draft') {
                    if (mode === 'throw') throw Error('Registration refused');
                    if (mode === 'reject')
                      return Promise.reject(Error('Registration refused'));
                  }
                  active.add(tool.name);
                  signal.addEventListener('abort', () =>
                    active.delete(tool.name),
                  );
                  return Promise.resolve();
                },
              },
      });
    }, mode);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
    await page.getByRole('button', { name: 'Add job', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Role title' })
      .fill(`Tool QA ${mode}`);
    await page
      .getByRole('textbox', { name: 'Posting URL' })
      .fill(`https://example.com/tool-qa/${mode}`);
    await page.getByRole('button', { name: 'Save job' }).click();
    await expect(
      page.getByRole('heading', { name: `Tool QA ${mode}`, exact: true }),
    ).toBeVisible();
    await page
      .getByText('Prepare this job for an assistant', { exact: true })
      .click();
    const status = page.getByRole('status', {
      name: 'Browser assistant tools',
    });
    const expected =
      mode === 'unavailable'
        ? 'This browser does not provide WebMCP tools. Same-origin tools are on window.relay in this signed-in tab. File handoff remains.'
        : mode === 'registered'
          ? 'Relay tools registered in this tab.'
          : 'WebMCP tools could not register in this tab. Same-origin tools remain on window.relay.';
    await expect(status).toContainText(expected);
    const activeNames = () =>
      page.evaluate(() => [...window.relayTestActiveTools]);
    if (mode === 'unavailable') {
      expect(await relayNames(page)).toEqual([...TOOL_NAMES]);
      expect(await relayNames(page)).not.toContain('relay_approve_application');
      const workspace = (await page.evaluate(() =>
        window.relay!.relay_read_workspace({}),
      )) as { jobs: { id: string; name: string; version: number }[] };
      expect(workspace).toEqual(
        expect.objectContaining({
          jobs: expect.arrayContaining([
            expect.objectContaining({ name: `Tool QA ${mode}` }),
          ]),
        }),
      );
      const job = workspace.jobs.find((row) => row.name === `Tool QA ${mode}`);
      expect(job).toBeTruthy();
      const draft = 'Exact window.relay staged wording for Tool QA.';
      await page.evaluate(
        async ({ id, version, draft }) =>
          window.relay!.relay_stage_draft({
            id,
            version,
            draft,
            blocker: '',
          }),
        { id: job!.id, version: job!.version, draft },
      );
      const application = (await page.evaluate(
        async (id) => window.relay!.relay_read_application({ id }),
        job!.id,
      )) as { job: { draft: string; accepted_draft: string | null } };
      expect(application.job.draft).toBe(draft);
      expect(application.job.accepted_draft).toBeNull();
      await page.getByRole('link', { name: 'Track jobs', exact: true }).click();
      await expect(page).toHaveURL(/\/track/);
      await page.getByRole('link', { name: 'Your facts', exact: true }).click();
      await expect(page).toHaveURL(/\/profile$/);
      await expect
        .poll(async () => page.evaluate(() => window.relay ?? null))
        .toBeNull();
    }
    if (mode === 'registered') {
      expect(await activeNames()).toEqual([...TOOL_NAMES]);
      expect(await activeNames()).not.toContain('relay_approve_application');
      expect(await relayNames(page)).toEqual([...TOOL_NAMES]);
      // Client navigation unmounts the workspace and removes its tools.
      await page.getByRole('link', { name: 'Track jobs', exact: true }).click();
      await expect(page).toHaveURL(/\/track/);
      await page.getByRole('link', { name: 'Your facts', exact: true }).click();
      await expect(page).toHaveURL(/\/profile$/);
      await expect
        .poll(async () => page.evaluate(() => window.relay ?? null))
        .toBeNull();
    }
    if (mode === 'throw' || mode === 'reject') {
      expect(await relayNames(page)).toEqual([...TOOL_NAMES]);
      expect(await relayNames(page)).not.toContain('relay_approve_application');
    }
    await expect.poll(activeNames).toEqual([]);
    expect(errors).toEqual([]);
  });
}
