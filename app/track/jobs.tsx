'use client';
import Link from 'next/link';
import {
  QUEUE_FILTERS,
  queueTitle,
  workspaceHref,
  type QueueFilter,
} from '../../lib/nav';
import {
  jobsMatchingQueue,
  splitJobName,
  type SheetJob,
} from '../../lib/runtime';

export function TrackJobSheet({
  jobs,
  filter,
  onFilter,
}: {
  jobs: SheetJob[];
  filter: QueueFilter;
  onFilter: (value: QueueFilter) => void;
}) {
  const rows = jobsMatchingQueue(jobs, filter);
  return (
    <section aria-labelledby="job-sheet-title" className="import">
      <h2 id="job-sheet-title">Jobs</h2>
      <p>
        Filter the sheet by status, then open a row to continue that job in the
        workspace.
      </p>
      <fieldset className="sheet-filters">
        <legend className="sheet-filter-label">Filter by</legend>
        {QUEUE_FILTERS.map((item) => {
          const count =
            item.value === 'All'
              ? jobs.length
              : jobs.filter((job) => job.status === item.value).length;
          return (
            <button
              aria-pressed={filter === item.value}
              className="secondary"
              key={item.value}
              onClick={() => onFilter(item.value)}
              type="button"
            >
              {item.label}
              <span>{count}</span>
            </button>
          );
        })}
      </fieldset>
      {!jobs.length ? (
        <p className="empty">
          No jobs yet. Add a job from the workspace, then return here to scan
          the list.
        </p>
      ) : !rows.length ? (
        <p className="empty">No jobs match this filter.</p>
      ) : (
        <div className="job-sheet-wrap">
          <table className="job-sheet">
            <thead>
              <tr>
                <th scope="col">Role</th>
                <th scope="col">Organization</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((job) => {
                const named = splitJobName(job.name);
                return (
                  <tr key={job.id}>
                    <th scope="row">
                      <Link href={workspaceHref(job.id)}>{named.role}</Link>
                    </th>
                    <td>{named.org || '—'}</td>
                    <td>{queueTitle(job.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
