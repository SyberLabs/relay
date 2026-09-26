import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  readWorkspaceRuntimeSource,
  readWorkspaceUiSource,
} from './workspace-ui-source.mjs';

void test('Runtime workspace composition stays split across focused modules', () => {
  const workspace = readFileSync('app/workspace.tsx', 'utf8');
  const runtime = readWorkspaceRuntimeSource();
  const ui = readWorkspaceUiSource();
  assert.match(workspace, /useWorkspaceRuntime\(/);
  assert.match(workspace, /<WorkspaceImportDock/);
  assert.match(workspace, /<WorkspaceJobPanel/);
  assert.match(workspace, /<WorkspaceHistoryDialog/);
  assert.doesNotMatch(workspace, /const applyExpired = useCallback/);
  assert.doesNotMatch(workspace, /async function saveFirstJob/);
  assert.match(runtime, /const applyExpired = useCallback/);
  assert.match(runtime, /async function saveFirstJob/);
  assert.doesNotMatch(runtime, /saveLimits|toggleAutopilot/);
  assert.match(ui, /id="import-dock"/);
  assert.match(ui, /id="application-inspect"/);
  assert.match(ui, /id="history-title"/);
  assert.match(runtime, /key=\{`connections-/);
  assert.match(workspace, /sessionRef=\{sessionRef\}/);
  assert.match(workspace, /onUnauthorized=\{applyExpired\}/);
  assert.ok(workspace.split('\n').length < 250, workspace.split('\n').length);
});
