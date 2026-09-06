import Link from 'next/link';
export default function About() {
  return (
    <main className="productpage">
      <Link className="brand" href="/">
        <span className="mark">r</span>relay
      </Link>
      <p className="eyebrow">A SYBERLABS PRODUCT · EARLY RELEASE</p>
      <h1>
        Your job search should
        <br />
        remember what you’ve done.
      </h1>
      <p className="lead">
        Relay brings research, application history and exact drafts into one
        workspace—so you can spend less time checking your assistant’s work.
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
      <h2>Start with one job.</h2>
      <p>
        Import your research, select an opportunity, then prepare a draft.
        Already interviewing? Keep notes and follow-ups without resetting your
        application status.
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
        Relay does not yet run an autonomous job hunt or send applications. Live
        provider connections require setup. This early release has no claimed
        hiring outcomes or proven throughput gains.
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
