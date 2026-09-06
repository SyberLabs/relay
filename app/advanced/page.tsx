import Link from 'next/link';

export default function Advanced() {
  return (
    <main className="productpage">
      <Link className="backlink" href="/">
        ← Workspace
      </Link>
      <h1>Advanced</h1>
      <p className="lead">
        Experimental tools for planning and agent batches. Start with one job in
        the workspace; return here when you need these tools.
      </p>
      <section className="import">
        <h2>
          <Link href="/review">Batch review</Link>
        </h2>
        <p>
          Review logged agent drafts and save style corrections. Staged drafts
          still need your exact-text acceptance in the workspace.
        </p>
      </section>
      <section className="import">
        <h2>
          <Link href="/preferences">Preferences</Link>
        </h2>
        <p>Compare postings to fit experimental preference weights.</p>
      </section>
      <section className="import">
        <h2>
          <Link href="/plan">This week</Link>
        </h2>
        <p>
          Explore a plan using your time budget and estimated reply rates.
          Scores do not predict offers.
        </p>
      </section>
      <footer>Relay / SyberLabs</footer>
    </main>
  );
}
