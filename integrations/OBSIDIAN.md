# Obsidian workflows

Obsidian holds editable research and interview notes. Relay holds the opportunity history, application status and exact draft approval. The integration is a manual Markdown handoff with no account connection or plugin requirement. Obsidian's [local Markdown files](https://help.obsidian.md/Files+and+folders/How+Obsidian+stores+data) and [properties](https://obsidian.md/help/properties) are the exchange format.

## Start with one opportunity

Open Relay's **Connect your tools** panel. If the opportunity is already in Relay, select it, choose the note purpose, then **Create note for selected job**. This fills in the job name, posting URL and a unique note ID. Move the downloaded file into your vault and edit it there.

For an opportunity that is not yet in Relay, use **Download example note** and replace its example job details. The note must begin with properties like these:

```markdown
---
relay_kind: research
relay_id: example-platform-engineer
relay_name: Example Company - Platform Engineer
relay_job: https://example.com/jobs/platform-engineer
---

# Role research

## What the role needs

## Evidence and sources

## Questions and unknowns
```

Keep `relay_id` unchanged when moving or renaming the file. Use a different ID for each separate note, including separate interviews for the same job. One note describes one posting. Add actual source links and distinguish facts from questions in the body; Relay does not verify claims automatically.

## Research, interview notes and follow-ups

The note-purpose selector provides three starting outlines:

- **Role research:** requirements, evidence, sources and unknowns.
- **Interview preparation and notes:** date, participants, preparation questions, lessons and next steps.
- **Follow-up planning:** the conversation, commitments and facts to check before drafting.

After editing, choose **Load research or draft** in Relay. Select one or several `.md` research files, expand their readable previews and check what will be imported. Choose **Preview matches**, then **Import into workspace**. Editing the import data invalidates the preview and requires another preview. Preview results are visible even in an empty workspace.

Matching posting URLs join the existing opportunity. A new opportunity starts Held. Research cannot change an existing job's status, overwrite its draft or grant approval. Note changes add observations to source history; exact repeats do not duplicate observations. Windows and Unix line endings are normalized. Research imports can advance the job version even for repeated notes, so finish research imports before exporting a draft to edit elsewhere.

Only selected text is read. Wikilinks and embed syntax remain text: linked notes, attachments, images and the rest of the vault are not loaded. Other note properties are ignored. The previewed research is uploaded to your Relay workspace only when you import it. A bad note or duplicate note ID rejects the entire selected batch before anything is staged.

## Edit a draft in Obsidian and bring it back

Select the job and choose **Edit draft in Obsidian**. Move the downloaded draft note into your vault. Keep its properties unchanged and edit only the body: the whole body becomes the proposed application or follow-up draft. Do not add research, headings or instructions unless you intend them to be part of the draft.

Load this note individually using **Load research or draft**. Relay checks its job ID, canonical posting identity and version before staging the text in the current editor. It also rejects applying the result if your selection, editor session, version or visible draft changed while the file was being read. Review the exact wording, then save or accept it using Relay's existing controls. Loading alone saves nothing and grants no approval. Existing Submitted and Live loop jobs retain their status when follow-up drafts are saved.

If the job changed in Relay, download a fresh draft note and manually carry your edits into it. Do not change the old version property to bypass the check. An empty draft can be downloaded as a writing starting point; an imported draft must contain 1 to 20,000 characters. Leading/trailing whitespace and Windows line endings are normalized on import.

Draft properties include `relay_kind: draft`, `relay_id` (the Relay job ID), `relay_name`, `relay_job`, `relay_key` and `relay_version`. They carry identity and concurrency information, not an approval token. The local command path returns the existing `relay.draft.v1` format with `provider: obsidian` and `reviewRequired: true`.

## Take job context into your vault

Choose **Download job context** for a reference snapshot containing the selected job's identity, current status snapshot, export time, editor base version, visible notes/blockers, visible draft and that job's source observations. Unsaved editor text is included and labelled. Source observations are quoted literally to keep imported instructions and embedded-note syntax from acting as export instructions.

Context snapshots have `relay_kind: snapshot` and are intentionally rejected on import. This prevents research history from repeatedly importing copies of itself. Use a research note for new observations and a draft note for returning wording. Snapshots are not complete backups: verified-facts input and review events are not exported, and the saved file does not update when Relay changes. Downloads do not overwrite or merge notes inside a vault.

## Local commands for assistants and terminals

Run these from the repository using Node 24. Quotes are required around paths containing spaces. Existing output files are never overwritten.

```sh
# Convert one or several explicitly named research notes to a reviewed import.
node integrations/relay.mjs obsidian-pull "vault/role.md" "vault/interview.md" private-data/obsidian-research.json

# Make a draft note from a selected-job packet downloaded in Relay.
node integrations/relay.mjs obsidian-draft private-data/relay-packet.json private-data/draft.md

# After editing the draft body, convert it to Relay's draft-result format.
node integrations/relay.mjs obsidian-pull private-data/draft.md private-data/draft-result.json
```

Load the resulting JSON in Relay. Research still goes through preview and import; drafts still go through job/version checks and human review. Markdown notes can also be loaded directly without any command conversion. The Obsidian commands make no network requests, require no verified-facts field or credentials, and never scan directories or modify source notes. Claude and Grok Bot handoffs remain available independently; facts for an AI draft still need explicit selection and verification.

## Limits and recovery

- Research: 1 to 200 selected notes; each body up to 20,000 characters, each note up to 100,000 characters, properties up to 10,000 characters. Total selected files must stay below 1.8 MB and converted research must also fit the import budget. Split larger selections deliberately.
- Identity: `relay_id` starts with a letter or number and contains at most 200 letters, numbers, dots, underscores or hyphens. `relay_name` is nonempty and at most 500 characters; `relay_job` is an HTTP or HTTPS posting URL. Missing `relay_kind` remains supported for older research notes. Other kinds are rejected except individual draft notes.
- Parsing: ordinary YAML quoting, comments and unrelated lists are supported. Duplicate keys, unsupported tags and aliases are rejected. Error messages identify the failed filename. Correct that file and reload the selection.
- Privacy: store real files under ignored `private-data/` or in your vault. A shared Obsidian vault follows its own sharing rules; choose its destination deliberately. No credentials, absolute vault locations, linked file contents or other jobs are added automatically. Relay is not an Obsidian Sync engine.

Automated verification covers research import and duplicate history against real SQLite migrations, draft round trips and stale/incorrect identities, batch failure, limits, quoting, source preservation and command output protection. Local API tests cover preview/read-back and status preservation. These checks use fictional data. An interactive journey in an installed Obsidian app, mobile vault or Obsidian Sync has not been verified.
