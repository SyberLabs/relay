import { readFileSync } from 'node:fs';

export const WORKSPACE_RUNTIME_FILE = 'app/workspace-runtime.tsx';
export const WORKSPACE_UI_FILES = [
  WORKSPACE_RUNTIME_FILE,
  'app/workspace-import-dock.tsx',
  'app/workspace-job-panel.tsx',
  'app/workspace-history-dialog.tsx',
  'app/workspace.tsx',
];

export function readWorkspaceRuntimeSource() {
  return readFileSync(WORKSPACE_RUNTIME_FILE, 'utf8').replace(/\r\n/g, '\n');
}

export function readWorkspaceUiSource() {
  return WORKSPACE_UI_FILES.map((file) =>
    readFileSync(file, 'utf8').replace(/\r\n/g, '\n'),
  ).join('\n');
}
