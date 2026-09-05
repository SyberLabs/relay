# ChatGPT and Codex integration verification - September 5, 2026

Lead engineer: Seth Carlson.

- Added browser prompt exports for ChatGPT and Codex, local prompt/draft packaging commands, and `codex-run` using the signed-in Codex CLI.
- A real local `codex-run` invocation completed with fictional job facts. The returned `relay.draft.v1` result passed Relay's file validation, preserved job identity and version, and retained `reviewRequired: true`. No application was sent. The private smoke-test packet/result are ignored and are not part of this release.
- All 57 automated tests passed, including five assistant tests and five public-copy tests. Type checking, lint and the production build passed.
- ChatGPT's manual conversation/file-upload path was not exercised in a signed-in ChatGPT browser. Its generated prompt, JSON response contract and Relay import validation were checked locally.
- This release does not add an authenticated hosted ChatGPT app, remote MCP server or automatic acceptance. Relay application deployment is separate from publishing its source and public descriptions.

See [setup](../integrations/OPENAI.md) and [public-copy maintenance](PUBLIC-COPY.md).
