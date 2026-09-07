# 02 — Build

Inputs: the current issue/plan, root contracts, abuse controls, delivery rules, relevant code and tests, and a checkpoint if resuming. Read applicable nested repository instructions explicitly when touching their scope; changing folders is not a guarantee that an agent reloads instructions.

Before trusting a checkpoint, verify repository, worktree, branch, HEAD, and dirty files. If they differ, inspect the delta and revalidate assumptions and earlier test evidence. Do not overwrite someone else's edits or treat a summary as accepted product text.

Implement the smallest complete result on the issue-linked branch. Keep one writer per overlapping change. Use bounded search and focused tool output; retain full test logs in ignored local output when needed. Add regression coverage for meaningful behavior and refusals, including proof that denied work cannot reach storage or an upstream operation. Run the relevant checks from delivery; run the full required suite before merge through CI.

Output: reviewable code and actual validation evidence, including failures and checks not run. Update the checkpoint on handoff, not after every tool call. Preserve unsaved work on refusal.

Review boundary: prepare the diff for peer review. Implementation, green tests, and a checkpoint confer no merge or release approval.
