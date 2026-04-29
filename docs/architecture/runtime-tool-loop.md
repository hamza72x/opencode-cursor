# Runtime Architecture: Cursor Agent + OpenCode Tool Loop

This document describes the current runtime architecture on `main`, with the default settings:

- `CURSOR_ACP_TOOL_LOOP_MODE=opencode`
- `CURSOR_ACP_PROVIDER_BOUNDARY=v1`
- `CURSOR_ACP_PROVIDER_BOUNDARY_AUTOFALLBACK=true`

## High-Level Flow

1. OpenCode sends chat requests to the `cursor-acp` provider (`/v1/chat/completions`).
2. The plugin proxy spawns `cursor-agent` per request and streams NDJSON (`stream-json` format).
3. Assistant text/thinking streams back to OpenCode as SSE.
4. `tool_call` events are intercepted at the provider boundary.
5. Intercepted calls are normalized and guarded, then returned as OpenAI `tool_calls`.
6. OpenCode executes tools locally and sends results back as `role: "tool"` messages in the next turn.
7. Prompt builder renders tool results into `TOOL_RESULT (call_id: ...)` blocks for the next `cursor-agent` invocation.

## Tool Ownership Model

### `opencode` mode (default)

- OpenCode owns execution of the active tool list.
- In `chat.params`, existing OpenCode tool definitions are preserved and passed through.
- `cursor-acp` does not execute SDK/MCP tools in this mode; it translates tool-call protocol boundaries.

### `proxy-exec` mode (legacy/compat mode)

- `cursor-acp` can inject tool definitions and execute via internal router:
  - Local tools
  - SDK-discovered tools
  - MCP-discovered tools
- Used as compatibility path and fallback strategy.

### `off` mode

- Tool-loop behavior is disabled.

## Provider Boundary (`legacy` vs `v1`)

The boundary abstraction is implemented in `src/provider/boundary.ts` and runtime handling in `src/provider/runtime-interception.ts`.

- `v1` (default): shared extraction/interception path for Bun + Node proxy handlers.
- `legacy`: previous extraction/runtime behavior.

`v1` adds:

- Tool name alias resolution (`shell`, `runCommand`, `delegateTask`, `skillMcp`, etc.)
- Schema compatibility normalization (`src/provider/tool-schema-compat.ts`)
- Optional edit-to-write reroute for malformed full-file replacement edits
- Tool-loop guard with fingerprinting (`src/provider/tool-loop-guard.ts`)
- Guarded fallback to `legacy` when enabled and specific termination/error conditions are met

## Loop Safety and Error Handling

`v1` loop safety is driven by two mechanisms:

- Schema validation guard: tracks repeated schema-invalid calls by tool + schema signature.
- Tool-loop guard: tracks repeated calls using fingerprints with error class awareness.

The guard classifies outcomes (`validation`, `not_found`, `permission`, `timeout`, `tool_error`, `success`, `unknown`) and terminates repetitive loops before they spin indefinitely.

## Plugin Tool Hook Layer

The OpenCode plugin tool hook (`buildToolHookEntries` in `src/plugin.ts`) registers local tools (`bash`, `read`, `write`, `edit`, `grep`, `ls`, `glob`, `mkdir`, `rm`, `stat`) and compatibility aliases such as `shell -> bash`.

When tool-hook execution is used, path/cwd defaults are normalized against tool context (`worktree` / `directory`) to keep file and shell behavior workspace-aware.

## Usage Metrics

`cursor-agent --output-format stream-json` emits a final `result` event with token usage when Cursor reports it. The proxy maps that payload to OpenAI-compatible usage so OpenCode can emit `step-finish` token data for tools such as OpenCode TokenSpeed Monitor.

Cursor fields are mapped as follows:

- `inputTokens + cacheReadTokens + cacheWriteTokens` -> `usage.prompt_tokens`
- `outputTokens` -> `usage.completion_tokens`
- `reasoningTokens` -> `usage.completion_tokens_details.reasoning_tokens`
- `cacheReadTokens` -> `usage.prompt_tokens_details.cached_tokens`
- `cacheWriteTokens` -> `usage.prompt_tokens_details.cache_write_tokens`

`prompt_tokens` includes cache tokens because OpenAI-compatible parsers treat `cached_tokens` as a subset of total prompt tokens.

Non-stream responses include `usage` on the chat completion response. Stream responses emit the normal final stop chunk, then a usage-only chunk with `choices: []`, then `[DONE]`.

If Cursor omits the final `result.usage` payload, the proxy omits `usage` instead of inventing zero-token metrics. This lets OpenCode and TokenSpeed fall back to their normal behavior without receiving misleading token counts.

Cost is passed through when a provider reports it as `cost`, `totalCost`, or `total_cost`. Cursor currently reports tokens but not request cost, so `open-cursor install` and `open-cursor sync-models` also write OpenCode `cost` config for known Cursor models using the official prices from [Cursor Models & Pricing](https://cursor.com/docs/models-and-pricing). Prices are stored per million tokens as `input`, `output`, `cache_read`, `cache_write`, and `context_over_200k` when Cursor documents a long-context rate.

Run `bun run check:pricing` to compare the current `cursor-agent models` output with the local official pricing map and warn when the Cursor pricing page markers change. Run `bun run check:pricing:fixture` for an offline fixture-based coverage check that does not require Cursor auth or network access.

## Operational Notes

- Proxy reuse is enabled by default (`CURSOR_ACP_REUSE_EXISTING_PROXY`); this can reuse an already-running process on port `32124`.
- During debugging or rollouts, disable reuse (`CURSOR_ACP_REUSE_EXISTING_PROXY=false`) or restart OpenCode to ensure the active proxy process matches the latest build.
- If `~/.config/opencode` is reset/wiped, reinstall or re-run model/config sync to restore provider config and plugin symlink.
