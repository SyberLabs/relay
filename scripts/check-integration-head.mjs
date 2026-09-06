import { spawnSync } from 'node:child_process';

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw Error((result.stderr || result.stdout || `git ${args.join(' ')}`).trim());
  }
  return result.stdout.trim();
}

function parseArgs(argv) {
  const options = { cwd: process.cwd(), base: 'origin/main', evidence: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--cwd' || arg === '--base' || arg === '--evidence') {
      const value = argv[++i];
      if (!value) throw Error(`Missing value for ${arg}`);
      if (arg === '--cwd') options.cwd = value;
      else if (arg === '--base') options.base = value;
      else options.evidence = value;
      continue;
    }
    throw Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function inspectHead({ cwd, base, evidence }) {
  const head = git(cwd, ['rev-parse', 'HEAD']);
  const baseSha = git(cwd, ['rev-parse', base]);
  const mergeBase = git(cwd, ['merge-base', 'HEAD', base]);
  const behind = Number(git(cwd, ['rev-list', '--count', `HEAD..${base}`]));
  const ahead = Number(git(cwd, ['rev-list', '--count', `${base}..HEAD`]));
  const headTree = git(cwd, ['rev-parse', 'HEAD^{tree}']);
  const report = {
    head,
    base: baseSha,
    merge_base: mergeBase,
    behind,
    ahead,
    head_tree: headTree,
    current: behind === 0,
    evidence_tree: null,
    evidence_matches: null,
  };
  if (evidence) {
    report.evidence_tree = git(cwd, ['rev-parse', `${evidence}^{tree}`]);
    report.evidence_matches = report.evidence_tree === headTree;
  }
  return report;
}

function format(report) {
  const lines = [
    `head ${report.head}`,
    `base ${report.base}`,
    `merge_base ${report.merge_base}`,
    `behind ${report.behind}`,
    `ahead ${report.ahead}`,
    `head_tree ${report.head_tree}`,
    `current ${report.current ? 'yes' : 'no'}`,
  ];
  if (report.evidence_tree) {
    lines.push(`evidence_tree ${report.evidence_tree}`);
    lines.push(`evidence_matches ${report.evidence_matches ? 'yes' : 'no'}`);
  }
  return `${lines.join('\n')}\n`;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const report = inspectHead(options);
  process.stdout.write(options.json ? `${JSON.stringify(report)}\n` : format(report));
  if (options.evidence && report.evidence_matches === false) process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'check-integration-head failed'}\n`);
  process.exitCode = 1;
}
