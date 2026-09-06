# Keeping Relay's public pages current

**Owner: Seth Carlson, lead engineer.** Application development credit: Mateo. Update [`public-copy.json`](public-copy.json) when shipped behavior, integration setup, ownership or release status changes. It is the single source for the managed RELAY sections in:

- `SyberLabs/relay` - project `README.md`
- `SyberLabs/.github` - organization `profile/README.md`
- `sdcarlson/sdcarlson` - personal `README.md`
- `SyberLabs/SyberLabs.github.io` - the RELAY integration paragraph on `syberlabs.space`

Other projects, biography text and website design remain independently maintained. The generator changes only text between `relay:public:start` and `relay:public:end`. Missing or duplicate markers stop the update.

## At every product change

1. Implement and test the behavior. Update its detailed integration guide, including verification limits.
2. Review `docs/public-copy.json`. Describe implemented behavior only; keep proposed integrations and unverified account access labeled. If no public facts changed, no metadata edit is needed.
3. Run `pnpm public-copy:sync`, then `pnpm public-copy:check` and `pnpm test`. Commit generated project copy with the implementation. The canonical **CI** workflow checks for stale project copy as part of its required quality job on pushes and pull requests.
4. After the change reaches `main`, the target repositories pull the canonical description on their next scheduled run. Each has a **Sync Relay public copy** workflow with a **Run workflow** button for an immediate refresh. No shared cross-repository personal token is needed; each workflow can write only its own repository.
5. Check the workflow results and, for the website, the published page. Missing permissions, removed markers or a concurrent push fail visibly rather than overwriting unrelated work or force-pushing.

## Refresh cadence and limits

The three downstream workflows check every 15 minutes and on edits to their managed page or workflow. They commit only when the generated text changes. The website explicitly requests a Pages build after a bot commit because bot pushes do not themselves guarantee a Pages deployment.

This is eventual synchronization, not an instantaneous guarantee. GitHub schedules can be delayed, and scheduled workflows in public repositories can be disabled after prolonged inactivity. Follow GitHub's workflow failure notifications and check the Actions page if copy does not refresh. The manual workflow button is the recovery path. Organization policy or branch protection may require adapting the write step to your review process.

Automation distributes reviewed facts; it cannot prove that prose still matches new product behavior. The product-change checklist remains the owner's responsibility. Do not edit a generated section by hand; the next refresh will restore it from the canonical source.

For a local preview of another target:

```sh
node scripts/sync-public-copy.mjs --target organization --root /path/to/org-checkout --check
node scripts/sync-public-copy.mjs --target profile --root /path/to/profile-checkout --check
node scripts/sync-public-copy.mjs --target website --root /path/to/website-checkout --check
```

Omit `--check` to update only the managed section. Sources: [GitHub schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [request a Pages build](https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build).
