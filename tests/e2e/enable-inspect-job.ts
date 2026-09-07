import type { Page } from '@playwright/test';

export async function enableInspectJob(
  page: Page,
  viewer: string,
  jobId: string,
) {
  const ledger = (await (await page.request.get('/api/applications')).json()) as {
    policy?: { version: number; jobs: string; maximum: number } | null;
  };
  const existing = ledger.policy?.jobs
    ? (JSON.parse(ledger.policy.jobs) as string[])
    : [];
  const saved = await page.request.post('/api/applications', {
    data: {
      action: 'policy',
      viewer,
      version: ledger.policy?.version ?? 0,
      enabled: true,
      review: 'all',
      jobs: [...new Set([...existing, jobId])],
      maximum: ledger.policy?.maximum ?? 10,
      expires: new Date(Date.now() + 86400000).toISOString(),
    },
  });
  if (!saved.ok())
    throw Error(`Unable to enable Inspect for this job (${saved.status()}).`);
}
