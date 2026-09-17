export type Job = {
  id: string;
  job_key: string;
  name: string;
  url: string | null;
  status: string;
  blocker: string;
  drafting_direction: string;
  draft: string;
  accepted_draft: string | null;
  version: number;
  company?: string;
  location?: string;
  remote?: string;
  source?: string;
  comp_min?: number | null;
  comp_max?: number | null;
};
export type Source = {
  id: string;
  job_key: string;
  name: string;
  notes: string;
  status: string;
  source_url: string;
};
export type ReviewEvent = {
  id: string;
  job_id: string;
  kind: string;
  created: string;
  detail: string;
};
export type Report = {
  new: number;
  known: number;
  submitted: number;
  items: { name: string; kind: string; key: string }[];
};
