import Link from 'next/link';
export default function About() {
  return (
    <main className="productpage">
      <Link className="brand" href="/">
        <span className="mark">r</span>relay
      </Link>
      <p className="eyebrow">A SYBERLABS PRODUCT · INVITED PILOT</p>
      <h1>
        Keep your application
        <br />
        work moving.
      </h1>
      <p className="lead">
        Manage applications across your preferred AI tools. Keep candidate facts
        available for reuse and preserve job research, reviewed drafts and
        application history as you move between opportunities.
      </p>
      <div className="actions">
        <Link href="/" className="primary">
          Open the workspace
        </Link>
        <a className="secondary" href="https://github.com/SyberLabs/relay">
          View on GitHub ↗
        </a>
      </div>
      <section className="stats">
        <div>
          <b>Keep the history</b>
          <p>
            Repeated postings join the same record. Earlier submissions stay
            visible.
          </p>
        </div>
        <div>
          <b>Review the actual words</b>
          <p>
            Edit drafts, resolve missing facts and accept a specific version.
          </p>
        </div>
        <div>
          <b>Bring your assistant</b>
          <p>
            Import Obsidian or Notion research and exchange draft packets with
            ChatGPT, Codex, Grok Bot or Claude.
          </p>
        </div>
      </section>
      <h2>Bring your applications together.</h2>
      <p>
        Add a posting with its title, URL and notes, or import multiple jobs from
        a tracker CSV. Select a job to prepare, review and accept its wording.
        Keep each application’s research and decisions available as you move
        to the next. Already interviewing? Save notes and follow-ups without
        resetting your application status.
      </p>
      <h2>What’s available today</h2>
      <p>
        Bring a tracker CSV into Relay: match the company, role and posting URL
        columns, preview the records, then import them as research. Original
        statuses remain in the notes; existing Relay status and accepted drafts
        are preserved. No tracker account connection is required.
      </p>
      <p>
        A working review workspace, duplicate detection, source history, and
        local command integrations. Obsidian notes can be selected for import,
        and job snapshots downloaded into your vault. Notion imports are
        read-only. Claude uses your API credentials. Grok Bot uses a documented
        file handoff in its VM. ChatGPT uses a prepared prompt and JSON file
        handoff. Codex supports the same handoff or a local command using your
        signed-in Codex CLI. Every returned draft requires review.
      </p>
      <p>
        Relay does not send applications. Live provider connections require
        setup. This early release has no claimed hiring outcomes or proven
        throughput gains.
      </p>
      <h2>What the checks mean</h2>
      <p>
        Facts are confirmed by you. Agent draft logs use heuristic word and
        number checks that can miss unsupported claims. Browser draft loading
        checks format, job identity and version, not citations or factual
        accuracy. Acceptance records your approval of exact wording.
      </p>
      <p>
        <Link href="/advanced">Advanced tools</Link> include experimental
        preference fitting, planning and agent batch review. They do not predict
        offers or assess qualifications.
      </p>
      <div className="actions">
        <a href="https://github.com/SyberLabs/relay/blob/main/integrations/README.md">
          Integration guide ↗
        </a>
        <a href="https://github.com/SyberLabs/relay/issues">
          Report an issue ↗
        </a>
      </div>
      <footer>Relay / SyberLabs</footer>
    </main>
  );
}
