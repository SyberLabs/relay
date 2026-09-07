import { useState } from 'react';
import type { ApplicationPolicy } from '../../lib/application-automation';
export function ApplicationPermissions({
  policy,
  jobs,
  busy,
  run,
  save,
}: {
  policy: ApplicationPolicy | null;
  jobs: { id: string; name: string; status: string }[];
  busy: boolean;
  run: (work: () => Promise<void>) => Promise<void>;
  save: (input: Record<string, unknown>) => Promise<ApplicationPolicy>;
}) {
  const [policyVersion, setPolicyVersion] = useState(policy?.version || 0);
  const [enabled, setEnabled] = useState(Boolean(policy?.enabled));
  const [allowed, setAllowed] = useState<string[]>(
    policy ? JSON.parse(policy.jobs) : [],
  );
  const [maximum, setMaximum] = useState(policy?.maximum || 10);
  const [expires, setExpires] = useState(() =>
    (
      policy?.expires || new Date(Date.now() + 7 * 86400000).toISOString()
    ).slice(0, 16),
  );
  return (
    <details>
      <summary>
        Application permissions · {policy?.enabled ? 'enabled' : 'disabled'}
      </summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const saved = await save({
              version: policyVersion,
              enabled,
              review: 'all',
              jobs: allowed,
              expires: `${expires}:00.000Z`,
              maximum,
            });
            setPolicyVersion(saved.version);
          });
        }}
      >
        <p>
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />{' '}
            Enable application execution
          </label>
        </p>
        <p>Approval setting: Review every application in Inspect.</p>
        {policy?.review === 'sensitive' && (
          <p>
            Your saved policy uses the earlier automatic setting. Save
            permissions to require Inspect approval for every application.
          </p>
        )}
        <p>
          <label>
            Expires (UTC){' '}
            <input
              type="datetime-local"
              required
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          </label>
        </p>
        <p>
          <label>
            Maximum applications{' '}
            <input
              type="number"
              min={1}
              max={100}
              value={maximum}
              onChange={(e) => setMaximum(Number(e.target.value))}
            />
          </label>
        </p>
        <fieldset>
          <legend>Allowed jobs</legend>
          {jobs.map((job) => (
            <p key={job.id}>
              <label>
                <input
                  type="checkbox"
                  checked={allowed.includes(job.id)}
                  onChange={(e) =>
                    setAllowed(
                      e.target.checked
                        ? [...allowed, job.id]
                        : allowed.filter((id) => id !== job.id),
                    )
                  }
                />{' '}
                {job.name} · {job.status}
              </label>
            </p>
          ))}
        </fieldset>
        <p>
          Up to ten starts per UTC day and one application executing at a time.
          Disabling permissions prevents new starts; it cannot recall
          information already sent.
        </p>
        <button disabled={busy}>Save permissions</button>
      </form>
    </details>
  );
}
