import {
  inferLevel,
  inferRemote,
  parseComp,
  stripHtml,
  estimateEffort,
  validateNormalised,
} from '../../../lib/postings.ts';

export function ashbyBoardUrl(board) {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`;
}

export function fromAshby(payload, board, company = board) {
  const jobs = payload?.jobs;
  if (!Array.isArray(jobs)) throw Error('Ashby board returned no jobs array.');
  return jobs.flatMap((raw) => {
    const j = raw;
    if (j?.isListed === false || !j?.jobUrl || !j?.title) return [];
    const body = (
      j.descriptionPlain ||
      stripHtml(j.descriptionHtml || '') ||
      ''
    ).trim();
    const location = j.location || '';
    const workplace = String(j.workplaceType || '').toLowerCase();
    const remote =
      workplace === 'remote'
        ? 'remote'
        : workplace === 'hybrid'
          ? 'hybrid'
          : workplace === 'onsite' || workplace === 'on-site'
            ? 'onsite'
            : inferRemote(`${location} ${body}`);
    const compensationText =
      j.compensation?.scrapeableCompensationSalarySummary ||
      j.compensation?.compensationTierSummary ||
      '';
    const [comp_min, comp_max] = parseComp(`${compensationText} ${body}`);
    return [
      {
        url: j.jobUrl,
        Job: j.jobUrl,
        Name: `${company} — ${j.title}`,
        Notes: body.slice(0, 4000),
        company,
        remote,
        comp_min,
        comp_max,
        location,
        posted: j.publishedAt || null,
        source: 'ashby',
        Status: 'Held',
        level: inferLevel(j.title),
        size: '',
        effort: estimateEffort(body),
      },
    ];
  });
}

export function usableAshby(payload, board, company) {
  return validateNormalised(fromAshby(payload, board, company));
}
