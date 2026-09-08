import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync('app/workspace.tsx', 'utf8');
const inspectUi = readFileSync('app/inspect.tsx', 'utf8');
const modals = readFileSync('app/runtime-modals.tsx', 'utf8');
const shell = readFileSync('app/runtime-shell.tsx', 'utf8');
const globals = readFileSync('app/globals.css', 'utf8');
const plantCss = readFileSync('app/runtime.css', 'utf8');
const queueUi = readFileSync('app/workbench-queue.tsx', 'utf8');

void test('the home workbench keeps existing acceptance and import contracts', () => {
  assert.match(workspace, /setModal\('profile'\)/);
  assert.match(workspace, /setModal\('tools'\)/);
  assert.match(workspace, /setModal\('inspect'\)/);
  assert.match(workspace, /id="application-inspect"/);
  assert.match(workspace, /onUnauthorized=\{applyExpired\}/);
  assert.match(modals, /Open Your facts/);
  assert.match(modals, /onClick=\{onNavigate\}/);
  assert.match(modals, /Review every application/);
  assert.match(modals, /readRuntimeModalProfile/);
  assert.match(modals, /settleRuntimeModalProfileRead/);
  assert.doesNotMatch(modals, /if \(cancelled\) return/);
  assert.match(modals, /if \(!which\) return null/);
  assert.match(modals, /function RuntimeModalDialog/);
  assert.match(modals, /<RuntimeModalDialog\s+key=\{which\}/);
  assert.doesNotMatch(modals, /Stop and ask instead of guessing/);
  assert.match(workspace, /No jobs yet/);
  assert.match(queueUi, /id="workspace-queue"/);
  assert.match(shell, /import '\.\/runtime\.css'/);
  assert.doesNotMatch(globals, /application workbench/);
  assert.match(shell, /aria-label="Import research"/);
  assert.match(shell, /Track jobs/);
  assert.doesNotMatch(shell, /ShellNav/);
  assert.match(workspace, /workbenchQueue\(/);
  assert.doesNotMatch(workspace, /chooseFilter/);
  assert.match(shell, /href="\/privacy"[\s\S]{0,40}onClick=\{onNavigate\}/);
  assert.match(workspace, /id="import-dock"/);
  assert.match(
    workspace,
    /disabled=\{blocked\}\s+onClick=\{\(\) => save\('Skip'\)\}/,
  );
  assert.match(workspace, /Heuristic word and number matches/);
  assert.doesNotMatch(workspace, /evidenceFitPercent|fitPct/);
  assert.doesNotMatch(workspace, /match percentage|ATS score/i);
  assert.doesNotMatch(modals, /match percentage|ATS score/i);
  assert.match(workspace, /Accept exact draft/);
  assert.match(workspace, /Save draft/);
});

void test('workbench is full-width with a persistent Approve & send control', () => {
  assert.match(plantCss, /application workbench/);
  assert.doesNotMatch(plantCss, /max-width:\s*980px/);
  assert.doesNotMatch(workspace, /className="cross"/);
  assert.doesNotMatch(plantCss, /\.rail\s*\{/);
  assert.doesNotMatch(plantCss, /\.pulse\s*\{/);
  assert.doesNotMatch(workspace, /progress\.pct/);
  assert.doesNotMatch(workspace, /draftProgress/);
  assert.doesNotMatch(workspace, /100%/);
  assert.match(inspectUi, /Approve & send/);
  assert.doesNotMatch(inspectUi, /Accept and send/);
  assert.match(workspace, /inspectSendControl\(/);
  assert.equal((workspace.match(/inspectSendControl\(/g) || []).length, 1);
  assert.match(inspectUi, /export function inspectSendControl/);
  assert.match(plantCss, /grid-template-columns:\s*var\(--queue\)/);
  assert.match(plantCss, /height:\s*100dvh;\s*max-height:\s*100dvh/);
  assert.match(plantCss, /\.review-col[\s\S]{0,80}overflow:\s*auto/);
  assert.match(plantCss, /@media \(max-width: 900px\)/);
  assert.match(shell, /Profile/);
  assert.match(shell, /History/);
  assert.match(workspace, /draft-tools/);
  assert.match(plantCss, /min-height:\s*12rem/);
  assert.match(plantCss, /\.block-form input\[type='text'\]/);
  assert.match(inspectUi, /className="btn btn-sm"/);
  assert.match(workspace, /connections-\$\{/);
  assert.match(workspace, /blocker-\$\{/);
  assert.match(queueUi, /waiting-\$\{/);
  assert.match(queueUi, /ledger-\$\{/);
});

void test('inspect copy stays truthful and never claims a disconnected wake', () => {
  assert.match(inspectUi, /Confirmation recorded by your agent/);
  assert.match(inspectUi, /Not sent/);
  assert.match(inspectUi, /Submission needs checking/);
  assert.match(inspectUi, /htmlFor=\{fieldId\}/);
  assert.doesNotMatch(inspectUi, /Required answer/);
  assert.doesNotMatch(inspectUi, /Unknown — hard blocker/);
  assert.doesNotMatch(inspectUi, /Mark operative waiting/);
  assert.doesNotMatch(inspectUi, /wake a terminated host/);
  assert.doesNotMatch(inspectUi, /independently verified employer/);
  assert.doesNotMatch(inspectUi, /Relay cannot wake/);
  assert.match(inspectUi, /inspectRecordedReceipt/);
  assert.match(inspectUi, /action: 'approve'/);
  assert.match(inspectUi, /digest: shown\.digest/);
  assert.doesNotMatch(inspectUi, /save\('Ready'\)/);
  assert.match(workspace, /refreshRef\.current\(\)/);
  assert.match(workspace, /inspectState === 'cancelled'/);
  assert.match(workspace, /id="history-title"/);
  assert.match(modals, /setPanel\('resume'\)/);
  assert.match(modals, /setPanel\('style'\)/);
});

void test('expiry clears runtime policy and context tiles', () => {
  const start = workspace.indexOf('const applyExpired = useCallback');
  const end = workspace.indexOf('const researchRows', start);
  const body = workspace.slice(start, end);
  assert.match(body, /setPolicy\(null\)/);
  assert.match(body, /setAutopilot\(false\)/);
  assert.match(body, /setStyleCount\(0\)/);
  assert.match(body, /selectedRef\.current = ''/);
  assert.match(workspace, /processAuthorizedGet/);
  assert.match(
    workspace,
    /if \(outcome\.switched\) \{\s*setModal\(null\);\s*setPolicy\(null\);\s*setAutopilot\(false\);\s*setStyleCount\(0\);\s*policyRef\.current = null/,
  );
});

void test('plant blocked answers do not post the remember preference flag', () => {
  const start = workspace.indexOf('onBlockedSubmit={() => {');
  assert.notEqual(start, -1);
  const submit = workspace.slice(
    start,
    workspace.indexOf('onClose={() => setModal(null)}', start),
  );
  assert.match(submit, /saveDecision\(\s*'answer',\s*false,/);
  assert.doesNotMatch(submit, /rememberAnswer/);
  assert.doesNotMatch(workspace, /rememberAnswer/);
  assert.doesNotMatch(modals, /onRemember/);
  assert.doesNotMatch(modals, /Save this as a progress note/);
  assert.match(modals, /Answer and continue/);
});

void test('stuck cards select the job without opening a dialog', () => {
  assert.match(queueUi, /id="workspace-queue"/);
  assert.match(queueUi, /onClick=\{\(\) => onChoose\(job\)\}/);
  assert.doesNotMatch(queueUi, /setModal\('blocked'\)/);
  assert.match(modals, /Fit is a heuristic word and number match/);
});

void test('tools name Relay connectors instead of job-board OAuth', () => {
  assert.match(modals, /Simplify/);
  assert.match(modals, /Notion/);
  assert.match(modals, /Obsidian/);
  assert.match(workspace, /setModal\('tools'\)/);
  assert.doesNotMatch(modals, /Reads listings, submits forms/);
  assert.doesNotMatch(modals, /4 job boards connected/);
});

void test('autopilot writes policy and never begins or accepts a draft', () => {
  const start = workspace.indexOf('async function saveLimits');
  const end = workspace.indexOf('\n  return (', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const body = workspace.slice(start, end);
  assert.match(body, /action: 'policy'/);
  assert.match(body, /review: 'all'/);
  assert.match(body, /saved\.length\s*\?\s*saved\s*:\s*eligible/);
  assert.match(body, /processAuthorizedGet/);
  assert.doesNotMatch(body, /['"]begin['"]/);
  assert.doesNotMatch(body, /save\('Ready'\)/);
  assert.doesNotMatch(body, /action:\s*['"]save['"]/);
  assert.match(shell, /Autopilot/);
  assert.match(shell, /aria-label="Import research"/);
});
