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

## Placeholder scan

No TBD. Arm interval, weights, table name, button name, tool names, and failure codes are fixed above.
