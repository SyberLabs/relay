const requiredMajor = 24;
const major = Number(process.versions.node.split('.')[0]);

if (major < requiredMajor) {
  console.error(`Relay needs Node >= ${requiredMajor}; this command is using ${process.version}.`);
  console.error('Install Node 24 or newer and put it first on PATH, then run pnpm install --frozen-lockfile and pnpm dev.');
  process.exitCode = 1;
} else {
  console.log(`Node ${process.version}`);
}
