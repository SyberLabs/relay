# Resume graph / tree (design)

A private branching record of resume versions: which text existed, what forked from what, and which node was used on which application. This is a design, not an implementation.

The graph is a prep and lineage spine. It does not publish research into a shared Field_Reports-style dump. Employer names, posting identifiers, applicant answers, and resume bodies stay out of Git.

## Problem

Resumes are forked ad hoc. A user or agent copies a file, edits a paragraph, and the parent is forgotten. The next session cannot tell whether the current file is the SWE track, the research track, or an abandoned experiment.

Agents overwrite or lose lineage. Without a closed set of known nodes, an assistant pastes a full rewrite into the only copy it can see. The previous wording disappears, or two chats each keep a different "latest" file.

Applications do not record which resume version was used. A later outcome cannot be attributed to a specific node, so expected value by resume version (E[v]) is hard to estimate. Reply-rate math that ignores which text was sent mixes incompatible treatments.

## Goals

- Keep a **branching tree** of resume nodes. An edit creates a child; the parent remains.
- Record **parent → child** forks so lineage is reconstructable without reading full bodies from Git.
- **Attribute applications** to resume nodes (`job_key` → `resume_node_id`) so later outcomes can attach to the node that was actually used.
- Give agents a **closed set of known nodes** and a fork/edit API. An agent may create a child of an existing node; it may not invent a free-floating latest file.
- Allow **multiple roots** when bases differ widely (for example a software-engineering base versus a research-track base). Roots are siblings, not a forced single trunk.

## Non-goals

- Autonomous apply or submit. Relay remains a research and review product. Hunt remains the apply rail.
- Storing secrets, credentials, or session tokens on a node.
- Dumping private Hunt answer banks into the graph or the repository.
- Recreating Field_Reports-style probe dumps that name real employers, posting IDs, or applicant PII.
- Committing real resume text, personal emails, or addresses.

## Model

Owner-scoped. Every read and write belongs to the authenticated user.

### Node

| Field | Meaning |
| --- | --- |
| `id` | Stable node identifier |
| `parent_id` | Nullable. `null` marks a root |
| `content_ref` | Hash or private-store pointer. **Not** full resume text in Git |
| `edit_summary` | Short human/agent note of what changed from the parent |
| `tags` | Role or track labels (for example `swe`, `research`) |
| `created_at` | Node creation time |
| `status` | `active` or `retired` |

A node is a version, not a job. The same node may be linked to many applications.

### Edge / usage

An application or `job_key` points at one `resume_node_id`. Outcome fields may be added later; they are not required for MVP. Linking does not accept a draft, change job status, or send an application.

### Multiple roots

Trees may start from more than one root when the bases are not usefully derived from each other. Do not flatten distinct careers into a fake common parent.

Fictional sketch (no real employers, no real text):

```
root:n1  "SWE base"           tags=[swe]
  └─ n2  "Acme Corp SWE role"  edit_summary="tighten systems bullets"
       └─ n3                   edit_summary="add distributed-systems project"

root:n10 "research base"      tags=[research]
  └─ n11 "ExampleCo research track"  edit_summary="emphasize methods over product"
```

`n1` and `n10` are both roots. `content_ref` values are opaque (`sha256:…` or `private:resume/…`). Bodies live in the user store or ignored `private-data/`.

Schema sketch only (not a migration):

```text
resume_nodes (
  id, owner_id, parent_id, content_ref,
  edit_summary, tags, created_at, status
)

resume_usages (
  owner_id, job_key, resume_node_id, linked_at
  -- outcome columns later
)
```

## Agent API sketch

Closed set. Every `node` argument is an existing id the owner can see. No implementation is implied beyond this sketch.

```text
list_roots() -> [node]
  Active roots for the caller. Children are reached from a root, not guessed.

fork(node, edits) -> node
  Create a child of `node`. `edits` produce a new content_ref in the private
  store. The parent is unchanged. Refuse unknown or retired parents.

link_application(job_key, node) -> usage
  Record that this job used this node. Does not accept text, change status,
  or submit. A later link may replace the node for that job_key if product
  rules allow; it must not rewrite history silently.

diff(a, b) -> summary
  Compare two known nodes. Return a summary suitable for review, not a
  full-body dump into logs or Git.

retire(node) -> node
  Mark `node` retired. Retired nodes stay in lineage and existing usage
  links. They are not valid fork parents for new children.
```

Agents cannot accept a draft, verify facts, or submit an application through these calls.

## MVP

Ship one root, its children, used-on links, and the fork command.

- One owner-visible tree is enough to prove lineage and attribution.
- `link_application` is the only usage write.
- `list_roots`, `fork`, `diff`, and `retire` may exist as local/CLI sketches before a UI.
- Defer a multi-root DAG browser, cross-tree merge, and automatic conflict resolution.
- Defer outcome columns and E[v] reporting until enough `job_key` → node links exist to estimate anything.

## Privacy

Full resume bodies stay in the private user store or ignored `private-data/`. The repository may hold this design and schema sketches only.

Never commit:

- real resume text
- real employer names or posting / Greenhouse identifiers
- Hunt answer banks or Hunt PII
- personal emails or addresses
- Field_Reports-style probe artifacts that tie a person to a real employer

Fictional fixtures (Acme Corp, ExampleCo) are the only examples allowed in Git, issues, and PR text. Logs and CI artifacts follow the same rule.

This path replaces publishing into Field_Reports. That path was closed because employer names and other probe PII do not belong in a public or shared repo. Do not recreate that content here.

## Fit with Relay

The graph sits **beside** job history and draft review. It does not replace them.

- **Job history** still owns opportunity identity, observations, and status. A usage edge names a `job_key`; it does not merge jobs or reset a submitted or live-loop record.
- **Draft review** still owns exact accepted wording for letters and application answers. Changing accepted text still requires fresh acceptance. A resume fork is not draft acceptance.
- **Hunt** remains the apply rail. The graph does not send forms, emails, or messages.
- **Fact ledger / style card** remain the citation gate for agent drafts. A resume node is not a verified fact and does not grant claims in a letter.

The graph is the prep/lineage spine: which resume existed, what it forked from, and which application used it. Relay stays a research and review product, not an autonomous application sender.

## Open questions

1. **Prune and promote-to-root.** When may a child become a new root? When may a retired branch be deleted versus kept for lineage? Promotion should not erase parent history that existing usage links depend on.
2. **Shared version machinery.** Draft packets already bind job identity and version and reject stale writes. Should resume nodes reuse that optimistic-version rule, or keep a separate graph version? Sharing reduces two clocks; separating avoids a resume fork invalidating an unrelated letter packet.
3. **Draft accept / version rules.** Accepted letter text is exact and versioned. A resume node change must not silently rewrite an accepted draft or clear acceptance. If a later implementation wants "this letter was written against resume n2," that is a new link type, not a reuse of `accepted_draft`.

Decide these before a second root, auto-merge, or any migration that stores bodies outside the private store.
