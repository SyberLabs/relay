# Working on RELAY

Seth (`@sdcarlson`) and Mateo (`@sykosyber`) use [the development board](https://github.com/orgs/SyberLabs/projects/1) and [repository issues](https://github.com/SyberLabs/relay/issues) as the shared work queue.

1. Pick one issue with a concrete user outcome. Assign one person, add priority and area, and write acceptance criteria before marking it Ready.
2. Create a short branch such as `feat/12-import-preview` or `fix/18-stale-draft`. Keep at most one active implementation issue per person.
3. Make the smallest complete change. Add regression tests for actual behavior and failure paths. Use fictional data.
4. Open a pull request with `Closes #number`, evidence, and migration/recovery impact. Move the issue to In review.
5. Read automatic agent findings. Fix confirmed defects; explain dismissed findings with code or test evidence. The other maintainer reviews the final changes and approves.
6. Squash merge after all required checks pass and conversations are resolved. The branch is removed automatically. Production release has a separate approval and smoke verification.
7. Observe the result with the intended user. Close a product experiment with evidence and a continue/change/stop decision, not just merged code.

`priority:P0` interrupts work for an incident or critical vulnerability. `priority:P1` blocks the next user/release outcome. `priority:P2` waits until that outcome is met. Put dependencies in the issue and use Blocked rather than silently leaving work In progress.

See [delivery and operations](docs/delivery.md) and [hosting setup](docs/hosting.md) for exact checks and release configuration. Ask for one peer approval; adding more approval layers does not improve a two-person team.

Every feature must also satisfy [abuse and cost controls](docs/abuse-controls.md), including bounded work, usage/storage quotas, and tests proving refused work cannot proceed.
