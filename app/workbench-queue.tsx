'use client';
import { Search } from 'lucide-react';
import { queueRowHint, sentPip } from '../lib/runtime';

export type QueueJob = {
  id: string;
  name: string;
  status: string;
  blocker: string;
  accepted_draft?: string | null;
};

function pipClass(job: QueueJob) {
  if (
    job.status === 'Skip' ||
    job.status === 'Submitted' ||
    job.status === 'Live loop'
  )
    return sentPip(job.status);
  if (job.blocker.trim()) return 'hold';
  return 'q';
}

export function WorkbenchQueue<T extends QueueJob>({
  waiting,
  ledger,
  selected,
  search,
  onSearch,
  onChoose,
  onFindMore,
  findDisabled,
}: {
  waiting: T[];
  ledger: T[];
  selected: string;
  search: string;
  onSearch: (value: string) => void;
  onChoose: (job: T) => void;
  onFindMore: () => void;
  findDisabled: boolean;
}) {
  const total = waiting.length + ledger.length;
  return (
    <section
      aria-label="Application queue"
      className="queue"
      id="workspace-queue"
    >
      <div className="plate-head queuehead">
        <h2 tabIndex={-1}>Review queue</h2>
        <span className="tally">{total}</span>
      </div>
      <label className="search">
        <Search size={17} />
        <input
          aria-label="Find a company or role"
          placeholder="Find a company or role"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
      </label>
      <div className="joblist plate-body q-list">
        <div className="q-sec">Waiting</div>
        {waiting.map((job) => (
          <button
            aria-label={job.name}
            className={'card job' + (selected === job.id ? ' selected' : '')}
            key={`waiting-${job.id}`}
            onClick={() => onChoose(job)}
            type="button"
          >
            <span className={'pip ' + pipClass(job)} />
            <span className="txt">
              <b>{job.name}</b>
              <small>{queueRowHint(job)}</small>
            </span>
          </button>
        ))}
        {!waiting.length && (
          <p className="hint">Nothing waiting. Import or add a job.</p>
        )}
        <div className="q-sec">Ledger</div>
        {ledger.map((job) => (
          <button
            aria-label={job.name}
            className={'card job' + (selected === job.id ? ' selected' : '')}
            key={`ledger-${job.id}`}
            onClick={() => onChoose(job)}
            type="button"
          >
            <span className={'pip ' + pipClass(job)} />
            <span className="txt">
              <b>{job.name}</b>
              <small>{queueRowHint(job)}</small>
            </span>
          </button>
        ))}
        {!ledger.length && (
          <p className="hint">
            Completed applications appear here.
          </p>
        )}
      </div>
      <div className="plate-foot">
        <button
          className="btn btn-signal"
          disabled={findDisabled}
          onClick={onFindMore}
          type="button"
        >
          Find more jobs
        </button>
      </div>
    </section>
  );
}
