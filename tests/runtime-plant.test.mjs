import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync('app/workspace.tsx', 'utf8');
const modals = readFileSync('app/runtime-modals.tsx', 'utf8');
const shell = readFileSync('app/runtime-shell.tsx', 'utf8');
const globals = readFileSync('app/globals.css', 'utf8');
const plantCss = readFileSync('app/runtime.css', 'utf8');

void test('the home plant keeps existing acceptance and import contracts', () => {
  assert.match(workspace, /What the agent knows about you/);
  assert.match(workspace, /Stuck, needs your answer/);
  assert.match(workspace, /Inspect what the agent wrote/);
  assert.match(workspace, /Review prepared application/);
  assert.match(
    workspace,
    /href="#application-inspect"[\s\S]{0,80}onClick=\{confirmLeave\}/,
  );
  assert.match(modals, /Open Your facts/);
  assert.match(modals, /onClick=\{onNavigate\}/);
  assert.match(modals, /Review every application/);
  assert.match(modals, /readRuntimeModalProfile/);
  assert.match(modals, /settleRuntimeModalProfileRead/);
  assert.doesNotMatch(modals, /if \(cancelled\) return/);
  assert.match(workspace, /onUnauthorized=\{applyExpired\}/);
  assert.match(modals, /if \(!which\) return null/);
  assert.match(modals, /function RuntimeModalDialog/);
  assert.match(modals, /<RuntimeModalDialog\s+key=\{which\}/);
  assert.doesNotMatch(modals, /Stop and ask instead of guessing/);
  assert.match(workspace, /No jobs yet/);
  assert.match(workspace, /id="workspace-queue"/);
  assert.match(shell, /import '\.\/runtime\.css'/);
  assert.match(plantCss, /application runtime plant/);
  assert.doesNotMatch(globals, /application runtime plant/);
  assert.match(shell, /aria-label="Import research"/);
  assert.match(shell, /href="\/privacy"[\s\S]{0,40}onClick=\{onNavigate\}/);
  assert.match(workspace, /id="import-dock"/);
  assert.match(
    workspace,
    /disabled=\{blocked\}\s+onClick=\{\(\) => save\('Skip'\)\}/,
  );
  assert.match(workspace, /Heuristic word and number matches/);
  assert.match(
    workspace,
    /hit · \$\{fit\.gates\.filter\(\(gate\) => gate\.status === 'miss'\)\.length\} miss/,
  );
  assert.doesNotMatch(workspace, /evidenceFitPercent|fitPct/);
  assert.doesNotMatch(workspace, /match percentage|ATS score/i);
  assert.doesNotMatch(modals, /match percentage|ATS score/i);
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

void test('stuck cards select the job without opening a dialog', () => {
  const start = workspace.indexOf('Stuck, needs your answer');
  const end = workspace.indexOf('<RuntimeModals');
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const stuck = workspace.slice(start, end);
  assert.match(stuck, /onClick=\{\(\) => chooseJob\(job\)\}/);
  assert.doesNotMatch(stuck, /setModal\('blocked'\)/);
  assert.match(modals, /Fit is a heuristic word and number match/);
});

void test('tools name Relay connectors instead of job-board OAuth', () => {
  assert.match(modals, /Simplify/);
  assert.match(modals, /Notion/);
  assert.match(modals, /Obsidian/);
  assert.match(workspace, /Simplify, Notion, Obsidian/);
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
