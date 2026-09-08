import Link from 'next/link';
export default function Privacy() {
  return (
    <main className="productpage">
      <Link className="brand" href="/">
        <span className="mark">r</span>relay
      </Link>
      <p className="eyebrow">A SYBERLABS PRODUCT · INVITED PILOT</p>
      <h1>How Relay uses your data</h1>
      <p className="lead">
        This page describes current shipped behavior for the invited pilot. It
        is not a warranty of hiring outcomes.
      </p>
      <h2>Who operates Relay</h2>
      <p>
        SyberLabs maintainers operate Relay. Seth Carlson owns the production
        Cloudflare account. Mateo Robles is the peer reviewer.
      </p>
      <h2>Identity</h2>
      <p>
        Cloudflare Access authenticates invited people before Relay runs.
        Workspace records belong to that authenticated Access subject. Access
        also supplies an email so Relay can require a human identity. Relay does
        not keep a separate email table. Cloudflare Access may keep its own
        session cookies and logs.
      </p>
      <h2>What Relay stores</h2>
      <p>
        Only the signed-in owner’s records: jobs, research observations, drafts,
        accepted wording, blockers, review events, candidate facts, style rules,
        preferences, choices, outcomes, application policies, prepared
        application fields and files, and immutable submission manifests. Quota
        counters use a hash of the owner identifier. After repeated writes,
        Turnstile may confirm a person; Relay stores a clearance expiry, not the
        token. Citation refusals store why a draft was blocked, not the refused
        text.
      </p>
      <p>
        Relay does not store assistant API keys. Local CLI tools read keys from
        your environment.
      </p>
      <h2>Who can read it</h2>
      <p>
        Every database read and write belongs to the authenticated user. Hosting
        operators with Cloudflare and D1 access can reach the database for
        recovery. Do not put applicant records in public issues.
      </p>
      <h2>Processors</h2>
      <p>
        Cloudflare provides Access, Workers, D1, Turnstile, connecting-IP rate
        limits, and optional request observability that must stay content-free.
        Product pages load fonts from Google Fonts. Assistants and vaults you
        use (ChatGPT, Codex, Claude, Grok Bot, Notion, Obsidian) receive only
        what you export or run under your own accounts and their policies.
        Public Greenhouse and Lever board pulls fetch job listings, not your
        profile.
      </p>
      <p>
        Relay does not POST the employer form. Inspect Accept on a complete
        armed payload authorizes a waiting operative to submit once at the
        employer.
      </p>
      <h2>Cookies, ads, and sale</h2>
      <p>
        Relay does not set advertising or analytics cookies and does not sell
        your records. Cloudflare Access may set its own session cookies.
      </p>
      <h2>Retention</h2>
      <p>
        History stays until an operator removes that owner’s records. This
        invited pilot has no self-service delete. Storage caps refuse new
        inserts; they do not auto-delete history.
      </p>
      <h2>Requests</h2>
      <p>
        Contact the maintainer who invited you. Report security issues through
        GitHub private vulnerability reporting. Do not include resumes, drafts,
        or credentials in public issues.
      </p>
      <h2>Changes</h2>
      <p>
        If shipped data practices change, this page changes in the same release.
      </p>
      <div className="actions">
        <Link href="/" className="primary">
          Open the workspace
        </Link>
        <Link href="/about" className="secondary">
          About Relay
        </Link>
      </div>
      <footer>
        Relay / SyberLabs
        <Link href="/about">About</Link>
      </footer>
    </main>
  );
}
