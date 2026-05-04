# 01 — Context

## What this template is

`template-mastra-nca` is the NCA Toolkit child template in Otaku Solutions' Mastra template family. It forks from `template-mastra-base` and adds:

- Typed Mastra tool wrappers around a focused subset of NCA Toolkit endpoints
- An example media-processing agent that uses the wrappers
- A reusable HTTP client helper for the NCA API (auth, error handling, timeout)
- An async job-polling pattern for long-running operations

## Relationship to base

| Layer | Source |
|---|---|
| Env loader (`src/lib/env.ts`) | Inherited, extended with NCA vars |
| AIMock provider switch | Inherited, unchanged |
| Supabase client factory | Inherited, unchanged |
| Mastra entry (`src/mastra/index.ts`) | Inherited, agent registration updated |
| Composite store, memory, observability | Inherited, unchanged |
| Docker, CI | Inherited |
| Lead-intake agent | **Removed** — replaced by media processor agent |
| Lead-intake scorers | **Removed** — replaced by tool-call accuracy + answer relevancy |
| NCA HTTP client | **New** |
| NCA tool wrappers (5 endpoints) | **New** |
| Media processor agent | **New** |

## Scope decisions (do not relitigate)

| Decision | Choice | Why |
|---|---|---|
| Endpoint coverage | 5 endpoints in v1: test, captionVideo, transcribeMedia, ffmpegCompose, getJobStatus. PLUS uploadToS3 if NCA exposes it directly. | Focused subset that demonstrates the pattern. Clients add more as needed; the helper makes new wrappers ~30 lines each. |
| Storage | S3-compatible (NCA handles the S3 talking) | Owner's existing infra; NCA's primary storage path |
| GCP Storage | **Out of scope for v1** | Clients on GCP can swap, but it's not the default |
| Long-running ops | Polling pattern via `getJobStatus` tool | Reliable, no external infra; webhook option documented but not built in |
| Webhook receiver | **Out of scope** | Adds infra complexity (public URL, signature verification); polling is sufficient for v1 |
| Python execution endpoint | **Out of scope** | Security-sensitive; defer until there's a clear use case |
| Default agent model | `anthropic/claude-haiku-4-5` | Cheap, fast, good at tool selection. Same lesson as voice template — Mastra's Anthropic adapter respects `ANTHROPIC_BASE_URL` so AIMock works. |
| Health check | `GET /v1/toolkit/test` at startup if `NCA_HEALTHCHECK_ON_BOOT=true` | Optional; adds boot latency but catches misconfig early |
| Retry policy | 3 retries with exponential backoff for 5xx and network errors; no retry for 4xx | Standard HTTP client behavior |
| Timeout | 60s default per request (matches NCA's own Cloudflare proxy limit) | Above this, force webhook or polling |

## What this template ships with that clients keep

- The NCA HTTP client (`src/mastra/lib/nca.ts`) — battle-tested wrapper with auth, retry, timeout, type safety
- 5 working tool wrappers — clients use as-is OR copy-and-adapt for other endpoints
- The async polling pattern (`pollJobStatus` helper)
- A working media-processing agent that demonstrates tool composition

## Quality bar

Same as base, plus:

- **Connectivity test passes** — `npm run nca:ping` returns 200 from `/v1/toolkit/test`, confirming NCA deployment is reachable AND the API key is valid
- **Tool calls succeed** — text-mode test in Studio invokes captioning or transcription on a real public-URL test asset and returns a result URL
- **Eval gate passes** — RAG-style scorers (tool-call accuracy + answer relevancy) clear thresholds when run against canonical media-processing requests
- **Polling works** — when given a long-running operation, the agent polls job status and returns the final result without timeout

## What this template does NOT include

- An NCA Toolkit deployment (clients deploy themselves; we point at it)
- All 22 NCA endpoints (5 in v1)
- Webhook receiver (polling only)
- GCP Storage backend
- Python code execution wrapper
- File upload UI (callers must already host source media at a public URL)
