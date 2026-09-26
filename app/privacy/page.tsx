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
        This page describes the current invited-pilot workflow. Relay does not
        claim hiring outcomes or guarantee a result.
      </p>
      <h2>Identity and access</h2>
      <p>
        Cloudflare Access authenticates invited people before Relay runs. Each
        workspace read and write is scoped to that authenticated owner. Relay
        does not keep a separate email table. Hosting operators with Cloudflare
        and database access can reach records for maintenance and recovery.
      </p>
      <h2>What Relay stores</h2>
      <p>
        Relay stores job records, research observations, drafts, accepted text,
        blockers, review events, candidate facts and rules, application state,
        manually recorded outcomes, receipts, and the operation data needed to
        enforce human authorization. Existing databases may also contain
        historical records from retired pilot tools; those records and their
        migration tables are preserved rather than silently deleted. Quota
        counters use a hash of the owner identifier. Relay does not sell your
        data.
      </p>
      <p>
        Relay does not store assistant API keys. Local commands read keys from
        your environment. Keep private packets and responses out of Git and
        public issues.
      </p>
      <h2>External services</h2>
      <p>
        Cloudflare provides Access, Workers, D1, Turnstile, and rate limiting.
        Relay pages, including the workspace, load fonts from Google Fonts.
        External assistants, Notion, and Obsidian receive data only through
        handoffs or access you initiate, under the accounts and policies you
        choose. Relay does not sync those accounts in the background.
      </p>
      <h2>Application actions</h2>
      <p>
        Accepting a draft records approval of its exact wording. It does not by
        itself authorize an application submission. Any application operation
        requires its separate, explicit human authorization in Inspect. Relay
        issues a one-use permit to an external browser; Relay itself does not
        POST the employer form. The included Chrome operative is demonstrated
        only against a fictional fixture.
      </p>
      <h2>Retention and requests</h2>
      <p>
        History stays until an operator removes that owner’s records. The pilot
        has no self-service delete. Storage caps refuse new inserts; they do
        not auto-delete history. Contact the maintainer who invited you for
        data requests. Report security issues through GitHub private
        vulnerability reporting; do not include resumes, drafts, or credentials
        in public issues.
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
