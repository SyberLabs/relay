import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync('app/workspace.tsx', 'utf8');
const modals = readFileSync('app/runtime-modals.tsx', 'utf8');
const shell = readFileSync('app/runtime-shell.tsx', 'utf8');

void test('the home plant keeps existing acceptance and import contracts', () => {
  assert.match(workspace, /What the agent knows about you/);
  assert.match(workspace, /Stuck, needs your answer/);
  assert.match(workspace, /Inspect what the agent wrote/);
  assert.match(workspace, /Approve and send/);
  assert.match(workspace, /No jobs yet/);
  assert.match(workspace, /id="workspace-queue"/);
  assert.match(shell, /aria-label="Import research"/);
  assert.match(workspace, /id="import-dock"/);
  assert.match(
    workspace,
    /disabled=\{blocked\}\s+onClick=\{\(\) => save\('Skip'\)\}/,
  );
  assert.match(workspace, /Heuristic word and number matches/);
  assert.doesNotMatch(workspace, /match percentage|ATS score/i);
  assert.doesNotMatch(modals, /match percentage|ATS score/i);
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
  assert.doesNotMatch(body, /['"]begin['"]/);
  assert.doesNotMatch(body, /save\('Ready'\)/);
  assert.doesNotMatch(body, /action:\s*['"]save['"]/);
  assert.match(shell, /Autopilot/);
  assert.match(shell, /aria-label="Import research"/);
});
