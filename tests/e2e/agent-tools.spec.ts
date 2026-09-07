import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    relayTestActiveTools: Set<string>;
  }
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
        ? 'This browser does not provide WebMCP tools.'
        : mode === 'registered'
          ? 'Relay tools registered in this tab.'
          : 'Relay tools could not register in this tab.';
    await expect(status).toContainText(expected);
    const activeNames = () =>
      page.evaluate(() => [...window.relayTestActiveTools]);
    if (mode === 'registered') {
      expect(await activeNames()).toEqual([
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
      ]);
      // Client navigation unmounts the workspace and removes its tools.
      await page.getByRole('link', { name: 'Your facts', exact: true }).click();
      await expect(page).toHaveURL(/\/profile$/);
    }
    await expect.poll(activeNames).toEqual([]);
    expect(errors).toEqual([]);
  });
}
