# template-mastra-nca — Build Spec

You (the AI coding agent) are building the NCA Toolkit child template by forking from `template-mastra-base` and adding typed Mastra tool wrappers around the NCA Toolkit API.

## Read these spec files in order

1. **`01-context.md`** — What this template is, what it inherits, what's new
2. **`02-architecture.md`** — File layout, dependencies, env vars added on top of base
3. **`03-files.md`** — Per-file specs with code targets and acceptance criteria
4. **`04-build-order.md`** — Strict phase order with verification checkpoints
5. **`05-verification.md`** — End-to-end test plan
6. **`06-known-gotchas.md`** — Pitfalls inherited from base + NCA-specific

## Operating mode

Same as base, RAG, and voice:

- **Stay in scope.** This template wraps a focused subset of NCA endpoints, not all 30+. Don't add additional endpoint wrappers without owner approval.
- **Use Mastra's tool primitive.** `createTool` with Zod input/output schemas. Don't write a custom HTTP wrapper layer.
- **Verify as you go.** Each phase has a checkpoint.
- **Ask before installing packages outside the deps list.**
- **Stop after each phase**, write to `SPEC/PROGRESS.md`, wait for owner's "continue."

## Owner context

This template forks from `template-mastra-base` (published at `https://github.com/hamchowderr/template-mastra-base`).

This template adds: typed tool wrappers around an NCA Toolkit deployment (Stephen Pope's media-processing API), an example media-processing agent, and an async job-polling pattern for long-running operations.

The owner deploys NCA Toolkit themselves (typically on a VPS or GCP) and points this template at their deployment via env var. This template does NOT deploy NCA Toolkit itself — that's a separate concern.

## Out of scope

- Deploying NCA Toolkit (separate Docker deploy; document but don't bake in)
- All 30+ NCA endpoints. We wrap a focused subset (see 02-architecture.md). Clients add more as needed.
- GCP Storage backend (S3-compatible only for v1; clients can swap)
- Webhook receiver for long-running jobs (we use polling pattern; webhook is mentioned in known-gotchas as a future option)
- Python code execution endpoint (security-sensitive; deferred until we have a reason to enable it)

## Reporting

Same `PROGRESS.md` format as previous templates.

## Critical: gotchas inherited from base

The high-impact ones for this template:

1. **Path aliases break inside `src/mastra/`** — relative imports only.
2. **`PostgresStore` requires `id` field** on construction.
3. **Provisioning uses `npx degit`**, not `npx create-mastra --template`.
4. **DuckDB requires glibc** — Docker uses `node:22-slim`.
5. **PostHog telemetry** — set `MASTRA_TELEMETRY_DISABLED=1`.

## Critical: NCA-specific gotchas

Discovered during scoping. Full list in `06-known-gotchas.md`. Highlights:

1. **NCA endpoints take URLs as input, not file uploads.** Source media must already be hosted at a public URL or signed S3 URL. The wrapper tools enforce this in their input schemas.
2. **Auth header is `x-api-key`** (lowercase, hyphenated), NOT `Authorization: Bearer`. Easy to get wrong.
3. **Operations >60s should use webhook OR poll job status.** Synchronous calls beyond 60s hit Cloudflare proxy timeouts on hosted deploys. The wrapper tools default to polling; a `webhookUrl` option is exposed for clients who want async.
4. **NCA Toolkit must be deployed and reachable.** Without `NCA_BASE_URL` pointing at a working deployment, every tool fails. The Phase 5 connectivity test catches this immediately.
5. **S3 credentials are NCA's concern, not ours.** Our Mastra agent doesn't talk to S3 directly — it tells NCA where to put outputs. NCA handles S3. The template's env vars are for talking to NCA, not S3.

Begin with `01-context.md`.
