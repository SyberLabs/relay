import Link from 'next/link';

export default function About() {
  return (
    <main className="productpage">
      <Link className="brand" href="/">
        <span className="mark">r</span>relay
      </Link>
      <p className="eyebrow">A SYBERLABS PRODUCT · INVITED PILOT</p>
      <h1>
        Keep each application’s
        <br />
        facts, wording, and history.
      </h1>
      <p className="lead">
        Relay keeps one private job record as work moves between you and the
        assistants you already use.
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
          <b>Keep one record</b>
          <p>Research, wording, status, and outcomes stay with the job.</p>
        </div>
        <div>
          <b>Review exact wording</b>
          <p>Relay refuses stale saves. You accept the text you reviewed.</p>
        </div>
        <div>
          <b>Carry context between tools</b>
          <p>Prepare a job handoff for an external assistant, then review its draft in Relay.</p>
        </div>
      </section>
      <h2>How it works</h2>
      <p>
        Add a job or import selected research as evidence. Confirm candidate
        facts yourself and include the facts needed for a draft in its assistant
        handoff. Save returned wording against the current job version, review
        it, then accept the exact text. Update application state yourself. In
        the fictional fixture, the included Chrome operative can record
        Submitted when it reports a receipt. Relay does not independently
        verify what the employer received.
      </p>
      <h2>Boundaries</h2>
      <p>
        Relay does not independently verify draft claims or POST an employer
        form. A separate application action requires human Inspect approval
        before an external browser receives a one-use permit. The included
        Chrome operative is demonstrated only against a fictional fixture. No
        hiring outcomes or time savings have been established.
      </p>
      <p>
        ChatGPT and Codex use explicit prompt and file handoffs; Codex also has
        a local CLI adapter. Obsidian, Notion, Claude, and Grok Bot use their
        documented local or file workflows. Live provider access depends on
        your own account and setup.
      </p>
      <div className="actions">
        <a href="https://github.com/SyberLabs/relay/blob/main/integrations/README.md">
          Integration guide ↗
        </a>
        <a href="https://github.com/SyberLabs/relay/issues">
          Report an issue ↗
        </a>
      </div>
      <footer>
        Relay / SyberLabs
        <Link href="/privacy">How Relay uses your data</Link>
      </footer>
    </main>
  );
}
