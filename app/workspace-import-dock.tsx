'use client';
import { TrackerImport } from './tracker-import';
import { expireSession } from '../lib/workspace-refresh';
import type { WorkspaceRuntime } from './workspace-runtime';

export function WorkspaceImportDock({ rt }: { rt: WorkspaceRuntime }) {
  const {
    applyExpired,
    busy,
    importRef,
    importTab,
    importText,
    onImportTabKey,
    previewedImport,
    refresh,
    report,
    researchRows,
    run,
    sessionRef,
    setImportTab,
    setImportText,
    setMessage,
    setPreviewedImport,
    setReport,
    setShowImport,
    showImport,
    signedOut,
  } = rt;
  return (
    <>
        {!signedOut && (
          <section
            aria-labelledby="import-dock-title"
            className="import import-dock"
            hidden={!showImport}
            id="import-dock"
            ref={importRef}
          >
            <div className="import-dock-head">
              <h2 id="import-dock-title" tabIndex={-1}>
                Import research
              </h2>
              <button
                className="textbutton"
                onClick={() => setShowImport(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <p>
              Review the selected research below, then preview its matches
              before saving. Importing adds these notes to your Relay workspace.
            </p>
            <div
              aria-label="How to import"
              aria-orientation="horizontal"
              className="import-tabs"
              role="tablist"
            >
              <button
                aria-controls="import-panel-json"
                aria-selected={importTab === 'json'}
                className="secondary"
                id="import-tab-json"
                onClick={() => setImportTab('json')}
                onKeyDown={onImportTabKey}
                role="tab"
                tabIndex={importTab === 'json' ? 0 : -1}
                type="button"
              >
                Research JSON
              </button>
              <button
                aria-controls="import-panel-csv"
                aria-selected={importTab === 'csv'}
                className="secondary"
                id="import-tab-csv"
                onClick={() => setImportTab('csv')}
                onKeyDown={onImportTabKey}
                role="tab"
                tabIndex={importTab === 'csv' ? 0 : -1}
                type="button"
              >
                Tracker CSV
              </button>
            </div>
            <div
              aria-labelledby="import-tab-json"
              hidden={importTab !== 'json'}
              id="import-panel-json"
              role="tabpanel"
            >
              {researchRows.map((row, index) => (
                <details key={index} className="source">
                  <summary>{row.Name}</summary>
                  <p>{row.Job}</p>
                  <pre
                    style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                  >
                    {row.Notes || 'No source notes recorded.'}
                  </pre>
                </details>
              ))}
              <details open={!researchRows.length}>
                <summary>Paste or edit import data</summary>
                <textarea
                  aria-label="Research JSON"
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    setPreviewedImport('');
                    setReport(null);
                  }}
                  placeholder='[{"url":"source-record-id","Name":"Company — Role","Job":"https://…","Status":"Held","Notes":"…"}]'
                />
              </details>
              <div className="import-dock-actions">
                {['preview', 'import'].map((action) => (
                  <button
                    className={action === 'import' ? 'primary' : 'secondary'}
                    disabled={
                      busy ||
                      !researchRows.length ||
                      (action === 'import' &&
                        previewedImport !== JSON.stringify(researchRows))
                    }
                    key={action}
                    onClick={() => {
                      try {
                        void run({ action, rows: JSON.parse(importText) });
                      } catch {
                        setMessage('Enter a valid JSON array.');
                      }
                    }}
                    type="button"
                  >
                    {action === 'import'
                      ? 'Import into workspace'
                      : 'Preview matches'}
                  </button>
                ))}
              </div>
            </div>
            <div
              aria-labelledby="import-tab-csv"
              hidden={importTab !== 'csv'}
              id="import-panel-csv"
              role="tabpanel"
            >
              <TrackerImport
                onImported={() => {
                  if (!sessionRef.current.viewer) return Promise.resolve();
                  return refresh().then(() => undefined);
                }}
                onUnauthorized={() => {
                  expireSession(sessionRef.current);
                  applyExpired();
                }}
              />
            </div>
          </section>
        )}
        {report && !signedOut && (
          <section className="report">
            <div>
              <b>Research check</b>
              <button className="textbutton" onClick={() => setReport(null)}>
                Dismiss
              </button>
            </div>
            <p>
              <strong>{report.new}</strong> new to this workspace ·{' '}
              <strong>{report.known}</strong> already known ·{' '}
              <strong>{report.submitted}</strong> already submitted
            </p>
            <details>
              <summary>See {report.items.length} results</summary>
              {report.items.map((i, n: number) => (
                <p key={n}>
                  {i.name}
                  <span className={'badge ' + i.kind}>{i.kind}</span>
                </p>
              ))}
            </details>
          </section>
        )}
    </>
  );
}
