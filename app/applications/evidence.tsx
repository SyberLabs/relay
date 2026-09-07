import type {
  ApplicationOperation,
  SubmissionManifest,
} from '../../lib/application-automation';
export function ApplicationEvidence({
  selected,
  name,
}: {
  selected: ApplicationOperation;
  name?: string;
}) {
  const manifest: SubmissionManifest = JSON.parse(selected.manifest);
  return (
    <>
      <h3>{name}</h3>
      <p>
        {selected.state} ·{' '}
        {selected.authority === 'policy'
          ? 'Policy-authorized; not individually reviewed'
          : selected.authority === 'explicit-review'
            ? 'Explicit approval recorded'
            : 'Review required'}
      </p>
      <p>
        Agent: {selected.actor} · Created: {selected.created}
      </p>
      <p>
        Destination:{' '}
        <a href={manifest.destination} target="_blank" rel="noreferrer">
          {manifest.destination}
        </a>
      </p>
      <dl>
        {manifest.fields.map((f) => (
          <div key={f.label}>
            <dt>
              <strong>{f.label}</strong>
            </dt>
            <dd
              style={{
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}
            >
              {f.value || '(empty)'}
            </dd>
          </div>
        ))}
      </dl>
      <ul>
        {manifest.files.map((f, i) => (
          <li key={i}>
            <a
              download={f.name}
              href={`data:application/octet-stream;base64,${f.base64}`}
            >
              {f.name} · download exact file
            </a>
            <small style={{ display: 'block', overflowWrap: 'anywhere' }}>
              SHA-256: {f.sha256}
            </small>
          </li>
        ))}
      </ul>
      <p style={{ overflowWrap: 'anywhere' }}>
        Operation: {selected.id}
        <br />
        Content checksum: {selected.digest}
        <br />
        Job version: {selected.job_version} · Policy version:{' '}
        {selected.policy_version}
      </p>
      {selected.receipt && (
        <p style={{ whiteSpace: 'pre-wrap' }}>
          Reported result: {selected.receipt}
        </p>
      )}
    </>
  );
}
