export const IMPORT_TABS = ['json', 'csv'] as const;
export type ImportTab = (typeof IMPORT_TABS)[number];

export function importTabFromKey(
  current: ImportTab,
  key: string,
): ImportTab | null {
  const index = IMPORT_TABS.indexOf(current);
  if (index < 0) return null;
  if (key === 'ArrowRight' || key === 'ArrowDown')
    return IMPORT_TABS[(index + 1) % IMPORT_TABS.length];
  if (key === 'ArrowLeft' || key === 'ArrowUp')
    return IMPORT_TABS[(index - 1 + IMPORT_TABS.length) % IMPORT_TABS.length];
  if (key === 'Home') return IMPORT_TABS[0];
  if (key === 'End') return IMPORT_TABS[IMPORT_TABS.length - 1];
  return null;
}

export function importTabButtonId(tab: ImportTab) {
  return tab === 'json' ? 'import-tab-json' : 'import-tab-csv';
}
