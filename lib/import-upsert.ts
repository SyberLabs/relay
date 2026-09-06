const status = `CASE WHEN jobs.status IN ('Offer','Accepted','Closed') THEN jobs.status WHEN jobs.status='Live loop' OR excluded.status='Live loop' THEN 'Live loop' WHEN jobs.status='Submitted' OR excluded.status='Submitted' THEN 'Submitted' ELSE jobs.status END`;
const blocker = `CASE WHEN jobs.blocker='' AND jobs.status NOT IN ('Ready','Submitted','Live loop') THEN excluded.blocker ELSE jobs.blocker END`;
const accepted = `CASE WHEN excluded.status IN ('Submitted','Live loop') THEN NULL ELSE jobs.accepted_draft END`;
const company = `CASE WHEN excluded.company!='' THEN excluded.company ELSE jobs.company END`;
const level = `CASE WHEN excluded.level!='' THEN excluded.level ELSE jobs.level END`;
const remote = `CASE WHEN excluded.remote!='' THEN excluded.remote ELSE jobs.remote END`;
const location = `CASE WHEN excluded.location!='' THEN excluded.location ELSE jobs.location END`;
const source = `CASE WHEN excluded.source!='' THEN excluded.source ELSE jobs.source END`;
const compMin = `COALESCE(excluded.comp_min,jobs.comp_min)`;
const compMax = `COALESCE(excluded.comp_max,jobs.comp_max)`;
const posted = `COALESCE(excluded.posted,jobs.posted)`;
const merged = `${status}, ${blocker}, ${accepted}, ${company}, ${level}, ${remote}, ${compMin}, ${compMax}, ${location}, ${posted}, ${source}`;
const current = `jobs.status, jobs.blocker, jobs.accepted_draft, jobs.company, jobs.level, jobs.remote, jobs.comp_min, jobs.comp_max, jobs.location, jobs.posted, jobs.source`;

export const jobImportSql = `INSERT INTO jobs (id,owner,job_key,name,url,status,blocker,draft,updated,company,level,remote,comp_min,comp_max,location,posted,source,effort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,job_key) DO UPDATE SET status=${status}, blocker=${blocker}, accepted_draft=${accepted}, company=${company}, level=${level}, remote=${remote}, comp_min=${compMin}, comp_max=${compMax}, location=${location}, posted=${posted}, source=${source}, effort=jobs.effort, version=jobs.version+1, updated=excluded.updated WHERE (${merged}) IS NOT (${current})`;

export const observationImportSql =
  'INSERT OR IGNORE INTO observations (id,owner,job_key,source_url,name,status,notes,created) VALUES (?,?,?,?,?,?,?,?)';
