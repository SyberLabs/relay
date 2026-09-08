// Resume extraction is deliberately deterministic and local. It proposes
// candidate facts; it never verifies them. Nothing here reaches a draft until
// a human has confirmed the individual line, so a generous extractor with a
// strict verification gate beats a clever extractor that is trusted.
export type Candidate = { claim: string; evidence: string; tag: string };
const sectionWords =
  /^(experience|work|employment|education|projects?|skills?|publications?|awards?|certifications?|summary|profile|objective|interests?|references?|volunteering|leadership)\b/i;
const contact =
  /(@|https?:\/\/|www\.|linkedin|github\.com|\+?\d[\d\s().-]{7,}\d)/i;
const credentialWords =
  /\b(bachelor|master|mba|ph\.?d|b\.?s\.?c?|m\.?s\.?c?|degree|certified|certificate|certification|licen[cs]e|diploma|graduated|magna|summa|cum laude)\b/i;
const roleWords =
  /\b(engineer|developer|scientist|manager|director|analyst|designer|intern|lead|architect|consultant|founder|president|head of|principal|senior|staff)\b/i;
const metricSignal =
  /\d+\s*(%|percent|x\b|k\b|m\b|ms\b|s\b|hrs?\b|hours?\b)|[$€£]\s*\d/i;
const claimVerb =
  /\b(led|built|shipped|increased|reduced|managed|founded|scaled|owned|launched|published|won|earned|grew|saved|delivered|architected|designed|created|improved|cut|drove|hired|mentored|taught|wrote|released|migrated|authored|raised|generated|developed|implemented|maintained|automated)\b/i;
function tagFor(line: string): string {
  if (metricSignal.test(line)) return 'metric';
  if (credentialWords.test(line)) return 'credential';
  if (roleWords.test(line) && /\b(19|20)\d{2}\b/.test(line)) return 'role';
  return 'detail';
}
function isSection(line: string): boolean {
  return (
    sectionWords.test(line) &&
    line.length < 40 &&
    !claimVerb.test(line) &&
    !/\d/.test(line)
  );
}
function* resumeItems(text: string): Generator<string> {
  let item = '';
  let indent = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^[\s•·▪◦*–—>-]+/, '').trim();
    const nextIndent = raw.length - raw.trimStart().length;
    const boundary =
      isSection(line) ||
      contact.test(line) ||
      (roleWords.test(line) &&
        !claimVerb.test(line) &&
        (/\b(19|20)\d{2}\b/.test(line) ||
          // Preserve short title-cased headings such as "Software Engineer"
          // without treating ordinary prose mentioning an engineer as a title.
          /^(?:[A-Z][A-Za-z]*[ -]){0,3}[A-Z][A-Za-z]*$/.test(line) ||
          line.split(/\s+/).every((word) => roleWords.test(word))));
    // Only deeper indentation signals a continuation. Never combine an
    // explicit bullet, heading, contact line or clear role with its neighbor.
    if (
      item &&
      line &&
      nextIndent > indent &&
      !/^\s*[•·▪◦*–—>-]/.test(raw) &&
      !boundary
    ) {
      item += ` ${line}`;
      continue;
    }
    if (item) yield item;
    item = line;
    indent = nextIndent;
    // These lines also end a pending item; do not attach later text to them.
    if (boundary) {
      yield item;
      item = '';
    }
  }
  if (item) yield item;
}
export function parseResume(text: string): Candidate[] {
  if (typeof text !== 'string' || !text.trim())
    throw Error('Paste resume text to extract facts.');
  if (text.length > 100000)
    throw Error('Paste a resume under 100000 characters.');
  const out: Candidate[] = [];
  const seen = new Set<string>();
  let section = 'Resume';
  for (const line of resumeItems(text)) {
    if (!line) continue;
    if (isSection(line)) {
      section = line.replace(/[:\s]+$/, '');
      continue;
    }
    if (line.length < 12 || line.length > 300) continue;
    if (contact.test(line)) continue;
    // A line earns a place in the queue only if it asserts something a
    // reviewer could confirm or reject.
    if (
      !/\d/.test(line) &&
      !claimVerb.test(line) &&
      !credentialWords.test(line)
    )
      continue;
    const key = line.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      claim: line,
      evidence: `Resume · ${section}`,
      tag: tagFor(line),
    });
    if (out.length >= 60) break;
  }
  if (!out.length)
    throw Error(
      'No candidate facts found. Paste the experience and education sections.',
    );
  return out;
}
