# Inspect Accept Sends Armed Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Human Inspect Accept authorizes send of one frozen payload only while the operative is armed; the operative then `begin`s once, submits at the employer, and records the receipt.

**Architecture:** Overwrite-in-place `application_preparations` streams live fill into an inspect DTO. `arm` freezes into existing immutable `application_operations` and sets `armed_until`. `approve` requires a live arm and does not `begin`. WebMCP/CLI verbs and `/apply` drive prepare/arm/wait/begin/complete. Relay never HTTP-posts to employers.

**Tech Stack:** TypeScript, D1/SQLite, Vinext React, Node test runner, Playwright Chromium, existing `/api/applications` gateway.

**Spec:** `docs/superpowers/specs/2026-09-07-inspect-accept-send-design.md` (issue #135).

## Global Constraints

- Node 24, pnpm 11.19.0, `pnpm install --frozen-lockfile`.
- Cite issue #135 and the spec in every PR.
- Owner isolation on every read/write; `viewer` must match; untrusted origin refused.
- Immutable `application_operations` rows stay immutable; live fill is preparations only.
- `approve` does not call `begin`. `begin` still consumes the one permit. Never retry `executing`.
- `action=arm` is gateway weight **1**, **6/user/min**; prepare remains weight 10; batch snapshots, not keystrokes.
- Arm window **20s**; client re-arms every **10s**.
- Inspect Accept is send authorization, not `save('Ready')`.
- No employer injection, no Relay-funded generation, no new scheduler.
- Fictional fixtures only. Delivery: lint, typecheck, test, public-copy:check, build, then sequential integration suites and `pnpm audit --audit-level high`.
- Stay draft until a maintainer other than the author approves. Production approval is separate.

## File map

| File | Responsibility |
| --- | --- |
| `drizzle/0009_*.sql`, `db/schema.ts`, `drizzle/meta/*` | `application_preparations` table, bounds triggers |
| `lib/application-automation.ts` | `upsertPreparation`, `inspectApplication`, `armPreparation`; tighten `approve` |
| `app/api/applications/route.ts` | `prepare`, `arm`; `GET ?job=` |
| `deploy/worker.mjs` (or existing quota helper) | weight 1 + 6/min for `arm` |
| `app/inspect.tsx`, `app/workspace.tsx` | Inspect region + Accept |
| `app/agent-tools.ts` | WebMCP verbs |
| `app/apply/page.tsx` | Compact overlay |
| `docs/abuse-controls.md`, `docs/agent-applications.md`, `AGENTS.md`, `docs/public-copy.json` | Shipped capability text |
| `tests/application-automation.test.mjs`, `tests/e2e/inspect-accept.spec.ts`, `tests/e2e/agent-tools.spec.ts` | Handshake and UI |

Stop for review after Task 3 (human can Accept a fixture-armed job). Overlay is Task 4–5.

---

### Task 1: Preparation row and inspect DTO

**Files:**
- Create: `drizzle/0009_application_preparations.sql` (name from drizzle generate)
- Modify: `db/schema.ts`, `drizzle/meta/_journal.json`, `drizzle/meta/0009_snapshot.json`
- Modify: `lib/application-automation.ts`
- Modify: `app/api/applications/route.ts`
- Test: `tests/application-automation.test.mjs`

**Interfaces:**
- Consumes: existing `database()`, `getChatGPTUser`, `validateManifest` field/file rules
- Produces:
  - `upsertPreparation(db, owner, input, now) => InspectView`
  - `inspectApplication(db, owner, jobId, now) => InspectView`
  - `type InspectView` as in the spec

- [ ] **Step 1: Write failing tests**

Add to `tests/application-automation.test.mjs` (same `database()` helper, after policy insert):

```js
void test('prepare streams field fill into inspect without creating an operation', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  const view = await upsertPreparation(
    db,
    'alice',
    {
      job: 'alice-0',
      actor: 'Fictional applying agent',
      destination: 'https://employer.example/jobs/0',
      fields: [
        { label: 'Full name', value: 'Avery Example', unknown: false },
        { label: 'Work authorization', value: '', unknown: true },
      ],
      files: [],
    },
    now,
  );
  assert.equal(view.job_id, 'alice-0');
  assert.equal(view.ready, false);
  assert.equal(view.armed, false);
  assert.equal(view.accept_enabled, false);
  assert.deepEqual(view.missing, ['Work authorization']);
  assert.equal(view.fields[1].unknown, true);
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) c FROM application_operations').get().c,
    0,
  );
});

void test('prepare refuses another owner job and oversized snapshots', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', config(), now);
  await assert.rejects(
    () =>
      upsertPreparation(
        db,
        'alice',
        {
          job: 'bob-0',
          actor: 'Fictional applying agent',
          destination: 'https://employer.example/jobs/0',
          fields: [{ label: 'Full name', value: 'Avery', unknown: false }],
          files: [],
        },
        now,
      ),
    /unavailable/i,
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && node --test --test-name-pattern 'prepare streams|prepare refuses' tests/application-automation.test.mjs`

Expected: FAIL (`upsertPreparation` not exported).

- [ ] **Step 3: Migration and helpers**

Add `applicationPreparations` to `db/schema.ts` with columns from the spec. Generate or hand-write `0009` SQL:

```sql
CREATE TABLE `application_preparations` (
  `owner` text NOT NULL,
  `job_id` text NOT NULL,
  `actor` text NOT NULL,
  `job_version` integer NOT NULL,
  `destination` text NOT NULL,
  `fields` text NOT NULL,
  `files` text NOT NULL,
  `operation_id` text,
  `ready` integer NOT NULL,
  `armed_until` text NOT NULL,
  `updated` text NOT NULL,
  PRIMARY KEY (`owner`, `job_id`)
);
```

Triggers: payload bound 240,000 combined fields+files; max 500 rows per owner.

Implement `upsertPreparation` to `SELECT` the job `WHERE owner=? AND id=?`, refuse missing/wrong owner, validate field/file bounds (reuse the non-digest parts of `validateManifest`; empty values allowed; `unknown` boolean), `INSERT ... ON CONFLICT(owner,job_id) DO UPDATE`, set `ready=0`, `armed_until=''`, `operation_id=NULL`. Return `inspectApplication`.

`inspectApplication`: read preparation; `armed = Date.parse(armed_until) > Date.parse(now)`; `missing` = labels with empty value or unknown; `ready` from row; `accept_enabled = ready && armed && state === 'proposed'` (state from joined operation if `operation_id` set).

Wire POST `action: 'prepare'` and GET `?job=` in `app/api/applications/route.ts`. GET without `job`/`id` unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test` (must include the new cases). Expected: pass, existing application tests still pass.

- [ ] **Step 5: Commit**

```bash
git add db/schema.ts drizzle lib/application-automation.ts app/api/applications/route.ts tests/application-automation.test.mjs
git commit -m "Add live application preparation inspect snapshot"
```

---

### Task 2: Arm freeze and Accept requires live arm

**Files:**
- Modify: `lib/application-automation.ts` (`armPreparation`, `actOnApplication` approve branch)
- Modify: `app/api/applications/route.ts`
- Modify: `deploy/worker.mjs` (or the module that assigns mutation weight)
- Modify: `docs/abuse-controls.md`
- Test: `tests/application-automation.test.mjs`, existing security/quota tests if they enumerate actions

**Interfaces:**
- Consumes: `upsertPreparation`, `proposeApplication`, `actOnApplication`
- Produces: `armPreparation(db, owner, { job, id, actor }, now) => InspectView`
- Approve SQL gains `AND EXISTS (SELECT 1 FROM application_preparations pr WHERE pr.owner=application_operations.owner AND pr.job_id=application_operations.job_id AND pr.operation_id=application_operations.id AND pr.armed_until>?)`

- [ ] **Step 1: Write failing tests**

```js
void test('arm refuses incomplete or unknown fields and freezes a complete snapshot', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', { ...config(), review: 'all' }, now);
  await upsertPreparation(db, 'alice', {
    job: 'alice-0',
    actor: 'Fictional applying agent',
    destination: 'https://employer.example/jobs/0',
    fields: [{ label: 'Full name', value: '', unknown: false }],
    files: [],
  }, now);
  await assert.rejects(
    () => armPreparation(db, 'alice', { job: 'alice-0', id: 'op-arm-0', actor: 'Fictional applying agent' }, now),
    /complete/i,
  );
  await upsertPreparation(db, 'alice', {
    job: 'alice-0',
    actor: 'Fictional applying agent',
    destination: 'https://employer.example/jobs/0',
    fields: [{ label: 'Work authorization', value: 'Yes', unknown: false }],
    files: [],
  }, now);
  const armed = await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: 'op-arm-0', actor: 'Fictional applying agent' },
    now,
  );
  assert.equal(armed.ready, true);
  assert.equal(armed.armed, true);
  assert.equal(armed.accept_enabled, true);
  assert.equal(armed.state, 'proposed');
  const op = await loadOperation(db, 'alice', 'op-arm-0');
  assert.equal(op.state, 'proposed');
});

void test('approve without a live arm refuses; approve with arm authorizes and does not begin', async () => {
  const db = database();
  await changeApplicationPolicy(db, 'alice', { ...config(), review: 'all' }, now);
  await upsertPreparation(db, 'alice', {
    job: 'alice-0',
    actor: 'Fictional applying agent',
    destination: 'https://employer.example/jobs/0',
    fields: [{ label: 'Full name', value: 'Avery Example', unknown: false }],
    files: [],
  }, now);
  const armed = await armPreparation(
    db,
    'alice',
    { job: 'alice-0', id: 'op-arm-1', actor: 'Fictional applying agent' },
    now,
  );
  const expired = '2026-09-07T12:00:21.000Z';
  await assert.rejects(
    () => actOnApplication(db, 'alice', action(await loadOperation(db, 'alice', 'op-arm-1'), 'approve'), expired),
    /arm|presence|page/i,
  );
  const approved = await actOnApplication(
    db,
    'alice',
    action(await loadOperation(db, 'alice', 'op-arm-1'), 'approve'),
    now,
  );
  assert.equal(approved.operation.state, 'authorized');
  assert.equal(approved.execute, undefined);
});
```

Keep the existing test that `begin` after authorize returns `execute: true`. Add: second `begin` still 409; `prepare` during `executing` 409.

- [ ] **Step 2: Run to verify fail**

Run: `node --test --test-name-pattern 'arm refuses|approve without' tests/application-automation.test.mjs`

Expected: FAIL (`armPreparation` missing; approve still succeeds without arm).

- [ ] **Step 3: Implement arm and approve gate**

`armPreparation`:

1. Load preparation for owner+job; refuse if missing.
2. Build manifest from destination + fields (all values nonempty, all `unknown===false`) + files; `validateManifest`.
3. If no operation or digest differs from current `operation_id`: if old op `state` in `proposed,authorized`, `cancel` it; `proposeApplication` with client `id` (require `review: all` path → `proposed`). Point `operation_id` at it.
4. If digest unchanged, keep operation, only refresh `armed_until`.
5. Set `ready=1`, `armed_until = new Date(Date.parse(now)+20_000).toISOString()`.
6. Return inspect DTO.

`actOnApplication` approve: add `pr.armed_until>?` with `now` in args. Failure message: `Operative is not on the page.`

POST `action: 'arm'`. Find the worker quota map; `arm` weight 1 and 6/min. If the worker only has generic mutation=10, add an explicit path for `/api/applications` + `action=arm` before the mutation counter. Extend `tests/security.test.mjs` so arm is not counted as 10 units (follow the existing CAPTCHA/quota test style in that file).

Update `docs/abuse-controls.md` “Controls for future changes” with arm presence limits.

- [ ] **Step 4: Run tests**

Run: `pnpm test && pnpm test:api` after build if API needs it. Expected: pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "Arm complete payloads and require live presence for Accept"
```

---

### Task 3: Inspect region and Accept on the selected job

**Files:**
- Create: `app/inspect.tsx`
- Modify: `app/workspace.tsx`
- Modify: `lib/workspace-stage.ts` only if Inspect lead copy needs a selected-job line (keep `Ready` lead for exact draft elsewhere)
- Test: `tests/e2e/inspect-accept.spec.ts`, `tests/e2e/applications.spec.ts` as needed so two Begin buttons do not conflict

**Interfaces:**
- Consumes: `GET /api/applications?job=` `InspectView`; POST `approve`
- Produces: Inspect region; Accept enabled iff `accept_enabled`

- [ ] **Step 1: Write failing e2e**

```ts
test('inspect accept stays off until armed then authorizes send without beginning', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with ChatGPT' }).click();
  await page.request.post('/api/workspace', {
    data: {
      action: 'import',
      rows: [
        {
          Name: 'Cedar Example — Inspect Send Engineer',
          Job: 'https://employer.example/jobs/inspect-send',
          Status: 'Held',
          Notes: 'Fictional inspect-accept fixture.',
        },
      ],
    },
  });
  const ws = await (await page.request.get('/api/workspace')).json();
  const job = ws.jobs.find((j: { name: string }) =>
    j.name.includes('Inspect Send'),
  );
  await page.request.post('/api/applications', {
    data: {
      action: 'policy',
      viewer: ws.viewer,
      version: 0,
      enabled: true,
      review: 'all',
      jobs: [job.id],
      maximum: 10,
      expires: new Date(Date.now() + 86400000).toISOString(),
    },
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Inspect Send/ }).click();
  await expect(page.getByRole('button', { name: 'Accept and send' })).toBeDisabled();
  await page.request.post('/api/applications', {
    data: {
      action: 'prepare',
      viewer: ws.viewer,
      job: job.id,
      actor: 'Fictional applying agent',
      destination: job.url,
      fields: [{ label: 'Full name', value: 'Avery Example', unknown: false }],
      files: [],
    },
  });
  await page.request.post('/api/applications', {
    data: {
      action: 'arm',
      viewer: ws.viewer,
      job: job.id,
      id: 'op-inspect-1',
      actor: 'Fictional applying agent',
    },
  });
  await expect(page.getByRole('button', { name: 'Accept and send' })).toBeEnabled();
  await page.getByRole('button', { name: 'Accept and send' }).click();
  await expect(page.getByText(/waiting for the operative to send/i)).toBeVisible();
  const data = await (await page.request.get('/api/applications')).json();
  const op = data.operations.find((o: { id: string }) => o.id === 'op-inspect-1');
  expect(op.state).toBe('authorized');
  const begun = await page.request.post('/api/applications', {
    data: {
      action: 'begin',
      viewer: ws.viewer,
      id: op.id,
      digest: op.digest,
    },
  });
  expect(begun.ok()).toBe(true);
  expect((await begun.json()).execute).toBe(true);
});
```

- [ ] **Step 2: Run e2e to verify fail**

Run: `pnpm build && pnpm test:e2e -- tests/e2e/inspect-accept.spec.ts` (or the repo’s exact integration runner filter). Expected: FAIL (no Accept and send).

- [ ] **Step 3: Implement Inspect**

`app/inspect.tsx`: given `jobId`, poll `GET /api/applications?job=` every 1s while mounted, render destination host, field filled/unknown marks, file names, Accept button `disabled={!accept_enabled}` named **Accept and send**, POST `{ action:'approve', viewer, id: operation_id, digest }`. Show ready-not-armed and authorized-waiting copy from the spec. Do not render file bytes.

Mount next to the selected-job detail in `app/workspace.tsx` (same place Connections sits). Do not bind this button to `save('Ready')`. Keep **Accept exact draft** only if it remains clearly named; Inspect’s control must not share that name.

Workspace poll: reuse existing refresh; also refresh inspect on visibility.

- [ ] **Step 4: Run e2e + unit**

Run: `pnpm test && pnpm build && pnpm test:e2e`. Expected: new spec pass; existing applications journey still has a single execution permit.

- [ ] **Step 5: Commit**

```bash
git commit -m "Show Inspect Accept and send for an armed proposal"
```

---

### Task 4: WebMCP / CLI verbs

**Files:**
- Modify: `app/agent-tools.ts`
- Modify: `tests/e2e/agent-tools.spec.ts` (registered names)
- Modify: `integrations/ASSISTANT-WORKFLOW.md` (operative loop)

**Interfaces:**
- Consumes: `/api/applications` prepare, arm, GET job, approve is **human-only** (do not register a tool that clicks Accept)
- Produces: tools `relay_prepare_application`, `relay_arm_application`, `relay_inspect_application`, `relay_begin_application`, `relay_finish_application`

- [ ] **Step 1: Write failing registered-name assertion**

In `tests/e2e/agent-tools.spec.ts`, extend the expected tool list with the five names above. Do **not** add `relay_approve_application`.

- [ ] **Step 2: Run to fail**

Expected: FAIL missing names.

- [ ] **Step 3: Register tools**

Each `run` uses existing `call('/api/applications', { viewer from /api/workspace, ... })`. `relay_begin_application` returns `{ execute, operation }` and description: “If execute is not true, do not click the employer submit control.” `relay_finish_application` maps `complete|uncertain|not-submitted` with `receipt`. Descriptions must say unknown answers use `unknown: true` and never invent.

No tool may set job status to Submitted except via `complete`.

- [ ] **Step 4: Run agent-tools e2e all four modes**

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "Register operative prepare, arm, begin, and finish tools"
```

---

### Task 5: Compact `/apply` overlay

**Files:**
- Create: `app/apply/page.tsx`
- Modify: `lib/nav.ts` only if the overlay must not appear in the main sidebar (it must not)
- Test: `tests/e2e/apply-overlay.spec.ts`

**Interfaces:**
- Consumes: same inspect DTO + tool status
- Produces: small page, query `?job=`, no plant chrome, transcript of last verb result

- [ ] **Step 1: Failing e2e** — open `/apply?job=` signed in, see Inspect summary and “Accept lives on the human workspace, not here.” Operative status `armed` / `waiting`. No **Accept and send** button on this page.

- [ ] **Step 2: Run to fail**

- [ ] **Step 3: Implement the compact page** (≈320px-friendly). Do not inject into other origins.

- [ ] **Step 4: Pass e2e**

- [ ] **Step 5: Commit**

```bash
git commit -m "Add compact apply overlay for the operative VM"
```

---

### Task 6: Contracts, public copy, full delivery

**Files:**
- Modify: `AGENTS.md`, `docs/agent-applications.md`, `docs/public-copy.json`, `docs/PUBLIC-COPY.md` if needed
- Modify: `tests/ui-copy.test.mjs` / public-copy check as required

- [ ] **Step 1: Write the failing public-copy or copy test** if shipped strings change.

- [ ] **Step 2: Update copy** to: human Accept on a complete armed payload authorizes the waiting operative to send once; Relay does not POST the employer form.

- [ ] **Step 3: `pnpm public-copy:check`**

- [ ] **Step 4: Full delivery** from `docs/delivery.md`

- [ ] **Step 5: Commit**

```bash
git commit -m "Describe Inspect Accept send in public and engineering contracts"
```

---

### Task 7: Inspect is the only approve path; ledger cannot Begin

**Files:**
- Modify: `app/applications/page.tsx`
- Modify: `tests/e2e/applications.spec.ts`
- Modify: `docs/agent-applications.md` only if it still tells humans to click Begin on `/applications`

**Interfaces:**
- Consumes: existing Inspect **Accept and send**; existing POST `begin` (operative / API)
- Produces: `/applications` is evidence, cancel, and receipt recording. It must not offer **Approve this exact application** or **Begin this application once**.

Spec: “Existing #128 e2e still can propose from `/applications` **or** is updated so Inspect is the only approve path; do not leave two conflicting Begin buttons.” Choose Inspect-only approve. Human Begin on the ledger consumes `execute: true` in the wrong session; the waiting operative then cannot submit.

- [ ] **Step 1: Write the failing e2e assertions** in `tests/e2e/applications.spec.ts`

After the existing prepare+arm API calls (keep those; approve still requires a live arm), replace the ledger Approve click and Begin click:

1. Assert `/applications` has **zero** buttons named `Approve this exact application` and **zero** named `Begin this application once` (before and after arm).
2. `page.goto('/')`, open the Pilot Engineer job, click **Accept and send**, wait for `Accepted — waiting for the operative to send.`
3. Operative `begin` via `page.request.post('/api/applications', { data: { action: 'begin', viewer, id, digest } })`. Expect `execute: true`.
4. Return to `/applications`, reopen the executing row, keep the file-download and `complete` receipt assertions unchanged (including second `begin` 409).
5. Still assert `/applications` has no Begin button after `begin`.

Do not add a second Accept control on `/applications`. Keep **Cancel proposal** and executing/uncertain receipt controls.

- [ ] **Step 2: Run to fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" && pnpm test:e2e -- tests/e2e/applications.spec.ts`

Expected: FAIL (Begin/Approve buttons still present, or Accept path not used).

- [ ] **Step 3: Remove ledger Approve and Begin**

In `app/applications/page.tsx`, delete the `proposed` Approve button and the `authorized` Begin button. Add one sentence that Accept and send lives on workspace Inspect and the operative begins after Accept. Do not call `begin` from this page.

- [ ] **Step 4: Run e2e**

Run: `pnpm test:e2e -- tests/e2e/applications.spec.ts tests/e2e/inspect-accept.spec.ts`

Expected: pass. Covering unit suite not required unless you touch `lib/`.

- [ ] **Step 5: Commit**

```bash
git commit -m "Keep Inspect as the only human approve path (#135)"
```

---

### Task 8: Human Blocked answers and r.close

**Files:**
- Modify: `lib/application-automation.ts` (`upsertPreparation` merge, or a dedicated answer helper)
- Modify: `app/api/applications/route.ts` if a new action is added
- Modify: `app/inspect.tsx` (`inspectMarkup` only — not `inspectSummaryMarkup`)
- Modify: `app/agent-tools.ts`
- Modify: `tests/e2e/agent-tools.spec.ts`, `tests/e2e/inspect-accept.spec.ts`
- Modify: `integrations/ASSISTANT-WORKFLOW.md`
- Test: `tests/application-automation.test.mjs`

**Interfaces:**
- Spec Inspect UI: unknowns list under **Blocked**; Accept disabled; human types the answer → that field `unknown: false` (human mutation); operative must re-arm.
- Spec CLI: `r.close` → `cancel` if pre-`begin`; else stop. No `relay_approve_application`.
- Overlay `/apply` must **not** gain the human answer inputs (`inspectSummaryMarkup` stays read-only).

`GET ?job=` must not include file bytes. A full `prepare` from Inspect would wipe stored files if the client only has `name`/`sha256`. Therefore the human answer path **must merge** into the stored preparation: update the named field’s `value` and `unknown: false`, keep destination and stored `files` JSON, set `ready=0`, clear `armed_until`, and cancel a pre-`begin` freeze if the digest would change (same rules as today’s `upsertPreparation`).

Choose one of:
- `POST { action: 'prepare', merge: true, job, fields: [{ label, value, unknown: false }] }` with `merge: true` requiring the preparation row to exist, or
- `POST { action: 'answer', job, label, value }` that does the same merge.

Do not invent a second table. Actor stays the existing preparation actor (or `Human` if you must set one — do not require a new actor from the human UI). Weight remains mutation 10. Bound `value` ≤ 20,000 characters. Refuse empty value. Refuse another owner’s job.

WebMCP: register `relay_cancel_application` with `id` + `digest`. Description: cancel only if pre-`begin`; if already `executing`, do not cancel and do not submit. Maps `r.close`. Do not add `relay_approve_application`.

- [ ] **Step 1: Failing tests**

Unit (`tests/application-automation.test.mjs`): prepare two fields (one `unknown: true`) plus a file entry in stored JSON; merge-answer the unknown label; inspect shows that field filled/`unknown: false`; files `name`/`sha256` unchanged; `accept_enabled` false until arm.

E2E (`tests/e2e/inspect-accept.spec.ts`): prepare Full name filled + Work authorization `unknown: true`; workspace Inspect shows **Blocked** and **Work authorization**; fill the Blocked answer and save; Accept still disabled; arm; Accept enabled.

E2E (`tests/e2e/agent-tools.spec.ts`): registered names include `relay_cancel_application` after `relay_finish_application`. Still no `relay_approve_application`.

- [ ] **Step 2: Run to fail**

- [ ] **Step 3: Implement merge-answer UI and cancel tool**

Blocked inputs live only in `inspectMarkup` (workspace). Each unknown field: label, textbox, submit named clearly (e.g. **Save answer**). POST the merge/answer action with `viewer`. After success, reload inspect. Do not nest a second Vinext `<Inspect />` island.

Wire `relay_cancel_application` through existing `applications({ action: 'cancel', id, digest })`. Document `r.close` in `integrations/ASSISTANT-WORKFLOW.md`.

- [ ] **Step 4: Run covering tests**

Run: `node --test tests/application-automation.test.mjs && pnpm test:e2e -- tests/e2e/inspect-accept.spec.ts tests/e2e/agent-tools.spec.ts tests/e2e/apply-overlay.spec.ts`

Expected: pass; overlay still has no Accept and no Blocked save controls.

- [ ] **Step 5: Commit**

```bash
git commit -m "Let humans answer Blocked Inspect fields and cancel via r.close (#135)"
```

---

### Task 9: Full Inspect handshake e2e

**Files:**
- Modify: `tests/e2e/inspect-accept.spec.ts`
- Modify: `tests/e2e/apply-overlay.spec.ts` if last-verb can be asserted without new product surface

**Interfaces:** Spec testing: overlay/`prepare` fills three fields; Inspect shows three filled; Accept disabled until arm; Accept; mock operative `begin`+`complete`; job Submitted; file bytes round-trip.

- [ ] **Step 1: Write the failing e2e** `inspect overlay prepare fills three fields then Accept send completes`

Use a distinct fictional job name (`Inspect Handshake Engineer`). Fields: `Full name`, `Work authorization`, `Cover note` (all nonempty, `unknown: false`). One file `resume.txt` with a small unique buffer (do **not** copy the 148000-byte ledger fixture unless needed; ≤ 4 KiB is enough to prove bytes). `prepare` then open `/` Inspect: three labels visible, Accept disabled. `arm`. Accept enabled. Click **Accept and send**. Operative `begin` (`execute: true`). `complete` with receipt `Fictional employer accepted application INS-9`. GET workspace: that job `status === 'Submitted'`. GET operation `?id=` still returns the exact file bytes (existing detail download or JSON `files[].base64`).

Also assert `/apply?job=` shows the three labels, copy “Accept lives on the human workspace, not here.”, and `Last verb result` output exists (`No verb result yet.` until a tool runs). If the apply e2e already covers overlay copy, do not duplicate that page’s chrome assertions; the handshake test may skip `/apply` if Task 5 e2e still passes.

- [ ] **Step 2: Run to fail** (missing three-field/Submitted assertions)

- [ ] **Step 3: Only add test + tiny glue if the handshake already works.** Do not add new routes. If complete does not set Submitted, that is a product bug: fix the existing `complete` path with a regression test, do not add a second status writer.

- [ ] **Step 4: Run** `pnpm test:e2e -- tests/e2e/inspect-accept.spec.ts tests/e2e/apply-overlay.spec.ts tests/e2e/applications.spec.ts`

- [ ] **Step 5: Commit**

```bash
git commit -m "Cover Inspect three-field file handshake through Submitted (#135)"
```

---

### Task 10: Spec, migration, and begin refresh_required

**Files:**
- Modify: `docs/superpowers/specs/2026-09-07-inspect-accept-send-design.md` (`r.wait_accept` interval)
- Create: `drizzle/0010_*.sql` (+ journal/snapshot if this repo requires them for 0010)
- Modify: `app/agent-tools.ts` (`relay_begin_application` catch)
- Modify: `tests/agent-tools-begin.test.mjs`

**Interfaces:**
- `r.wait_accept` polls at least every **2 seconds (prefer 3)**, matching `integrations/ASSISTANT-WORKFLOW.md` and the 120 dynamic req/user/min cap. Do not restore 500ms–1s.
- If an environment already applied the **old** `0009` capacity trigger (`WHEN count>=500` without the existing-row exception), a follow-on migration must `DROP TRIGGER IF EXISTS application_preparations_capacity` then `CREATE TRIGGER` with the current `WHEN` (abort only when there is **no** existing `(owner, job_id)`). Idempotent on the already-fixed trigger.
- `relay_begin_application` on refresh failure returns `{ execute, operation, refresh_required: true }` like `relay_save_progress`. Update the source-contract test. Do not retry `begin`.

- [ ] **Step 1: Failing tests** — begin test asserts `refresh_required: true` in the catch return. Add or extend a unit that the 0010 SQL contains `DROP TRIGGER` and the `NOT EXISTS` capacity `WHEN` (string inspect of the migration file is enough; do not require a live D1 apply in this task unless the repo already migrates 0010 in unit tests).

- [ ] **Step 2: Run to fail**

- [ ] **Step 3: Implement spec text, 0010, begin catch**

Follow existing drizzle journal style (`0009_new_radioactive_man` is idx 9). Do not rewrite `application_operations`. Do not drop `application_preparations`.

- [ ] **Step 4: Run** `node --test tests/agent-tools-begin.test.mjs tests/application-automation.test.mjs && pnpm public-copy:check` if copy unchanged, skip copy sync.

- [ ] **Step 5: Commit**

```bash
git commit -m "Align Inspect wait_accept, capacity trigger, and begin refresh (#135)"
```

---

## Spec coverage

| Spec section | Task |
| --- | --- |
| Preparation storage + inspect DTO | 1 |
| Arm freeze, 20s window, approve requires arm | 2 |
| Abuse weight 1 / 6 min | 2 |
| Inspect Accept UI, not Ready | 3 |
| CLI/WebMCP verbs, no agent Accept tool | 4 |
| Overlay not in employer origin | 5 |
| Public copy / AGENTS / agent-applications | 6 |
| begin/complete/uncertain unchanged | 2–4 |
| Owner isolation | 1 tests |
| Inspect-only approve; no ledger Begin | 7 |
| Human Blocked answers; `r.close` | 8 |
| Three-field file handshake e2e through Submitted | 9 |
| wait_accept 3s; 0010 capacity DROP+CREATE; begin `refresh_required` | 10 |

## Placeholder scan

No TBD. Arm interval, weights, table name, button name, tool names, and failure codes are fixed above. Remaining work is Tasks 7–10 (spec completeness after Tasks 1–6).
