import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('assistant prompts and returned files preserve explicit draft review', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  await page
    .getByRole('button', { name: 'Import research', exact: true })
    .click();
  await page.getByRole('textbox', { name: 'Research JSON' }).fill(
    JSON.stringify([
      {
        url: 'https://example.com/research/assistant-browser',
        Name: 'Assistant Example — Engineer',
        Job: 'https://example.com/jobs/assistant-browser',
        Status: 'Held',
        Notes: 'Fictional assistant handoff record.',
      },
      {
        url: 'https://example.com/research/other-context',
        Name: 'Other Context Job',
        Job: 'https://example.com/jobs/other-context',
        Status: 'Held',
        Notes: 'OTHER_JOB_PRIVATE_RESEARCH',
      },
    ]),
  );
  await page.getByRole('button', { name: 'Preview matches' }).click();
  await expect(
    page.getByText('Preview complete. No records were imported.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Import into workspace' }).click();
  await expect(page.getByText('Workspace updated.')).toBeVisible();
  await page
    .getByRole('button', { name: /Assistant Example — Engineer/ })
    .click();
  await page.getByText('Prepare this job for an assistant', { exact: true }).click();
  await expect(
    page.getByText(
      'This separate text box is not saved or linked to your ledger.',
      { exact: false },
    ),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Facts to share for this draft' })
    .fill('Built a fictional inventory service.');
  const editor = page.getByRole('textbox', {
    name: 'Application answer or outreach draft',
  });
  await editor.fill('Unsaved wording visible to the assistant.');
  await page
    .getByText('Continue a task with ChatGPT or Codex', { exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'What should the assistant draft next?' })
    .fill('Revise only the opening paragraph.');
  const research = page.getByRole('textbox', {
    name: 'Research to share with the assistant',
  });
  await expect(research).toHaveValue('');
  await page.getByRole('button', { name: 'Use this job’s research' }).click();
  expect(await research.inputValue()).toContain(
    'Fictional assistant handoff record.',
  );
  expect(await research.inputValue()).not.toContain(
    'OTHER_JOB_PRIVATE_RESEARCH',
  );

  for (const assistant of ['ChatGPT', 'Codex']) {
    const pending = page.waitForEvent('download');
    await page
      .getByRole('button', { name: `Prepare for ${assistant}` })
      .click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(
      `relay-${assistant.toLowerCase()}-prompt.md`,
    );
    const prompt = await readFile((await download.path())!, 'utf8');
    expect(prompt).toContain('Built a fictional inventory service.');
    expect(prompt).toContain('Unsaved wording visible to the assistant.');
    expect(prompt).toContain('Revise only the opening paragraph.');
    expect(prompt).toContain('Fictional assistant handoff record.');
    expect(prompt).not.toContain('OTHER_JOB_PRIVATE_RESEARCH');
    const result = JSON.parse(prompt.split('Required output:\n')[1]);
    expect(result.reviewRequired).toBe(true);
    result.draft = `Fictional wording returned by ${assistant}.`;
    if (assistant === 'ChatGPT') {
      await page
        .getByLabel('Paste complete relay.draft.v1 JSON')
        .fill(JSON.stringify(result));
      await page
        .getByRole('button', { name: 'Load draft for review', exact: true })
        .click();
    } else {
      await page.getByLabel('Load integration result').setInputFiles({
        name: 'relay-result.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(result)),
      });
    }
    await expect(editor).toHaveValue(result.draft);
    await expect(
      page.getByText(
        /Draft format, job identity and version checked; claims were not citation-checked/,
      ),
    ).toBeVisible();
    await expect(
      page.getByText(/Saving here does not run the agent citation check/),
    ).toBeVisible();
    let workspace = await (await page.request.get('/api/workspace')).json();
    const original = workspace.jobs.find(
      (job: { id: string }) => job.id === result.job.id,
    );
    expect(original.status).toBe('Held');
    expect(original.accepted_draft).toBeNull();
    expect(original.draft).not.toBe(result.draft);

    if (assistant === 'Codex') {
      await page
        .getByRole('button', { name: 'Save draft', exact: true })
        .click();
      await expect(
        page.getByText('Saved. Your review is preserved.'),
      ).toBeVisible();
      await page.reload();
      await page
        .getByRole('button', { name: /Assistant Example — Engineer/ })
        .click();
      await expect(editor).toHaveValue(result.draft);
      workspace = await (await page.request.get('/api/workspace')).json();
      const saved = workspace.jobs.find(
        (job: { id: string }) => job.id === result.job.id,
      );
      expect(saved.status).toBe('Held');
      expect(saved.accepted_draft).toBeNull();
      expect(saved.version).toBeGreaterThan(result.job.version);
      await page.getByText('Prepare this job for an assistant', { exact: true }).click();
      await page.getByLabel('Load integration result').setInputFiles({
        name: 'stale-result.json',
        mimeType: 'application/json',
        buffer: Buffer.from(
          JSON.stringify({ ...result, draft: 'Stale replacement.' }),
        ),
      });
      await expect(
        page.getByText(
          'Select the matching job. If it has changed, download a new packet or draft note.',
        ),
      ).toBeVisible();
      await expect(editor).toHaveValue(result.draft);
    } else {
      await editor.fill('Unsaved wording visible to the assistant.');
    }
  }
  await page
    .getByRole('textbox', { name: 'Facts to share for this draft' })
    .fill('Facts for the first job only.');
  await page
    .getByText('Continue a task with ChatGPT or Codex', { exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'What should the assistant draft next?' })
    .fill('Continue the first job only.');
  await research.fill('Research for the first job only.');
  await page.getByRole('button', { name: /Other Context Job/ }).click();
  await expect(
    page.getByRole('textbox', { name: 'Facts to share for this draft' }),
  ).toHaveValue('');
  await page
    .getByText('Continue a task with ChatGPT or Codex', { exact: true })
    .click();
  await expect(
    page.getByRole('textbox', {
      name: 'What should the assistant draft next?',
    }),
  ).toHaveValue('');
  await expect(research).toHaveValue('');
});
