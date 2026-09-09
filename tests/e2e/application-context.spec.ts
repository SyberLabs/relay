import { expect, test } from '@playwright/test';
import { openDraftTools } from './open-draft-tools';

for (const width of [1280, 390]) {
  test(`assistant context and versioned return preserve exact review at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    // Exercise the actual registered callbacks. The live Codex browser probe
    // separately establishes real WebMCP availability; this is deterministic QA.
    await page.addInitScript(() => {
      const registered: Record<
        string,
        { execute: (input: unknown) => Promise<unknown> }
      > = {};
      Object.assign(window, { relayTestTools: registered });
      Object.defineProperty(document, 'modelContext', {
        value: {
          registerTool(tool: {
            name: string;
            execute: (input: unknown) => Promise<unknown>;
          }) {
            registered[tool.name] = tool;
          },
        },
        configurable: true,
      });
    });
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
    const call = async (path: string, data: unknown) => {
      const result = await page.request.post(path, { data });
      expect(result.ok()).toBe(true);
      return result.json();
    };
    const name = `Context ${width} — Backend Engineer`;
    await call('/api/workspace', {
      action: 'import',
      rows: [
        {
          url: `https://example.com/context/${width}`,
          Name: name,
          Job: `https://example.com/jobs/context-${width}`,
          Status: 'Held',
          Notes: 'Fictional research: TypeScript service maintenance.',
        },
      ],
    });
    await call('/api/profile', {
      action: 'propose',
      facts: [
        {
          claim: `Built the fictional context-${width} TypeScript service`,
          tag: 'role',
        },
        { claim: `Unconfirmed context-${width} credential`, tag: 'credential' },
        { claim: `Expired context-${width} certification`, tag: 'credential' },
      ],
    });
    const profile = await (await page.request.get('/api/profile')).json();
    const confirmed = profile.facts.find((f: { claim: string }) =>
      f.claim.startsWith(`Built the fictional context-${width}`),
    );
    const expired = profile.facts.find((f: { claim: string }) =>
      f.claim.startsWith(`Expired context-${width}`),
    );
    await call('/api/profile', {
      action: 'verify',
      id: confirmed.id,
      claim: confirmed.claim,
    });
    await call('/api/profile', {
      action: 'verify',
      id: expired.id,
      claim: expired.claim,
      expires: '2000-01-01T00:00:00.000Z',
    });
    await page.reload();
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await openDraftTools(page);
    const workspace = await (await page.request.get('/api/workspace')).json();
    const job = workspace.jobs.find((j: { name: string }) => j.name === name);
    async function tool(name: string, input: unknown) {
      return page.evaluate(
        async ({ name, input }) => {
          const registry = (
            window as unknown as {
              relayTestTools: Record<
                string,
                { execute: (value: unknown) => Promise<unknown> }
              >;
            }
          ).relayTestTools;
          try {
            return { result: await registry[name].execute(input) };
          } catch (error) {
            return { error: String(error) };
          }
        },
        { name, input },
      );
    }
    const before = (await tool('relay_read_application', { id: job.id }))
      .result as {
      job: typeof job;
      facts: { id: string }[];
      research: { notes: string }[];
    };
    expect(before.job.version).toBe(job.version);
    expect(before.facts.some((f) => f.id === confirmed.id)).toBe(true);
    expect(before.facts.some((f) => f.id === expired.id)).toBe(false);
    expect(before.facts).toHaveLength(workspace.facts.length);
    expect(before.research).toHaveLength(1);
    expect(before.research[0].notes).toContain(
      'TypeScript service maintenance',
    );
    const draft = `I built the fictional context-${width} TypeScript service.`;
    const returned = {
      id: job.id,
      version: before.job.version,
      draft,
      blocker: '',
    };
    expect((await tool('relay_stage_draft', returned)).error).toBeUndefined();
    const staged = await (await page.request.get('/api/workspace')).json();
    expect(
      staged.jobs.find((j: { id: string }) => j.id === job.id).accepted_draft,
    ).toBeNull();
    // Deliberately test one stale submission, not an automatic mutation retry.
    expect(
      (
        await tool('relay_stage_draft', {
          ...returned,
          draft: 'Stale replacement',
        })
      ).error,
    ).toContain('changed');
    expect(returned.draft).toBe(draft);
    await page.reload();
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await openDraftTools(page);
    const editor = page.getByRole('textbox', {
      name: 'Application answer or outreach draft',
    });
    await expect(editor).toHaveValue(draft);
    const accept = page.getByRole('button', { name: 'Accept exact draft' });
    await expect(accept).toBeEnabled();
    // Synthetic browser regression only; not evidence of human approval.
    await accept.click();
    await expect(page.getByText('This exact draft is accepted.')).toBeVisible();
    await page.screenshot({
      path: `outputs/ci/application-context-${width}.png`,
      fullPage: true,
    });
    const accepted = (await tool('relay_read_application', { id: job.id }))
      .result as {
      job: typeof job;
      history: { events: { kind: string; detail: string }[] };
    };
    expect(accepted.job.accepted_draft).toBe(draft);
    expect(
      accepted.history.events.some(
        (e) =>
          e.kind === 'Draft accepted' && JSON.parse(e.detail).draft === draft,
      ),
    ).toBe(true);
    expect(accepted.history.events.some((e) => e.kind === 'Review saved')).toBe(
      true,
    );
    await editor.fill(draft + ' I welcome a conversation.');
    await expect(page.getByText('This exact draft is accepted.')).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(
      page.getByText('Saved. Your review is preserved.'),
    ).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: new RegExp(name) }).click();
    const edited = (await tool('relay_read_application', { id: job.id }))
      .result as { job: typeof job };
    expect(edited.job.accepted_draft).toBeNull();
    expect(edited.job.draft).toBe(draft + ' I welcome a conversation.');
  });
}
