import { jobKey, type SourceRow } from './domain.ts';

export const TITLE_MAX = 500;
export const NOTES_MAX = 20000;

export type FirstJobFields = {
  title: string;
  url: string;
  notes: string;
};

export type FirstJobErrors = {
  title?: string;
  url?: string;
  notes?: string;
};

export type FirstJobRecord = {
  id: string;
  job_key: string;
  name: string;
  status: string;
};

function postingUrl(url: string) {
  return jobKey(url.trim(), '');
}

export function firstJobErrors(input: FirstJobFields): FirstJobErrors {
  const errors: FirstJobErrors = {};
  const title = input.title.trim();
  if (!title) errors.title = 'Enter a role title.';
  else if (title.length > TITLE_MAX)
    errors.title = 'Role title must be 500 characters or fewer.';
  const url = input.url.trim();
  if (!url) errors.url = 'Enter an HTTP or HTTPS posting URL.';
  else {
    try {
      postingUrl(url);
    } catch {
      errors.url = 'Enter an HTTP or HTTPS posting URL.';
    }
  }
  if (input.notes.length > NOTES_MAX)
    errors.notes = 'Research notes must be 20,000 characters or fewer.';
  return errors;
}

export function firstJobRow(input: FirstJobFields): SourceRow {
  const errors = firstJobErrors(input);
  if (errors.title) throw Error(errors.title);
  if (errors.url) throw Error(errors.url);
  if (errors.notes) throw Error(errors.notes);
  const url = input.url.trim();
  return {
    url: 'first-job:' + postingUrl(url),
    Name: input.title.trim(),
    Job: url,
    Status: 'Held',
    Notes: input.notes,
  };
}

export function existingJobForUrl<T extends { job_key: string }>(
  jobs: T[],
  url: string,
): T | undefined {
  try {
    const key = postingUrl(url);
    return jobs.find((job) => job.job_key === key);
  } catch {
    return undefined;
  }
}

export function joinExistingJobNotice(job: FirstJobRecord): string {
  return `This posting URL matches ${job.name}. Saving adds research to that job and keeps its ${job.status} status, draft, accepted wording, and history.`;
}
