# 06 — Known Gotchas

Pitfalls discovered during template scoping. Read before debugging anything weird.

## Inherited from base (and refined by RAG/voice templates)

All gotchas from `template-mastra-base/SPEC/06-known-gotchas.md` apply here. Re-read those if you haven't.

The high-impact ones for this template:

1. **Path aliases break inside `src/mastra/`** — relative imports only.
2. **`PostgresStore` requires `id` field** on construction.
3. **DuckDB requires glibc** — Docker uses `node:22-slim`, not Alpine.
4. **PostHog telemetry leaks errors in restricted networks** — set `MASTRA_TELEMETRY_DISABLED=1`.
5. **AIMock requires Anthropic agent model.** OpenAI now uses Responses API which AIMock doesn't intercept; Google has hardcoded base URL. Anthropic is the only provider whose Mastra adapter respects `ANTHROPIC_BASE_URL`. (Inherited lesson from voice template.)

## NCA-specific gotchas

### Job status endpoint is non-obvious

The polling endpoint is `POST /v1/toolkit/job/status` (singular `job`) with `{ "job_id": "..." }` in the request **body**.

It's NOT:
- `GET /v1/toolkit/jobs/{job_id}` (REST-style with ID in path) — this returns 404
- `GET /v1/toolkit/job/status?job_id=...` (query param) — this returns 404
- `/v1/toolkit/jobs/status` plural — that's the OTHER endpoint, which lists ALL jobs in a time range

Easy to get wrong because most APIs use the REST-style path. NCA chose the POST-with-body pattern. The Phase 4 connectivity test should include a probe to `/v1/toolkit/job/status` to surface this immediately if it's still wrong in the spec.

### Auth header is `x-api-key`, NOT `Authorization`

NCA uses a custom header. Easy to default to `Authorization: Bearer <key>` and get 401s.

The `ncaRequest` helper handles this. Don't bypass it.

### NCA endpoints take URLs, not file uploads

Source media must be at a publicly-accessible URL. The `videoUrl` / `mediaUrl` schemas enforce this with `.url()`. If a client wants to upload local files, they need to:
1. Upload to S3/Supabase Storage themselves
2. Get a signed URL or public URL
3. Pass that to NCA via the agent

This template does NOT include file upload handling. Adding it is per-client work.

### Trailing slash on `NCA_BASE_URL` breaks everything

The Zod schema rejects trailing slashes with a clear error. If you ever bypass the schema (e.g., setting the URL programmatically), the resulting URL will have `//` in it and NCA will return 404s.

### Long-running operations need polling or webhook

NCA's hosted deployments run behind Cloudflare with a 60-second proxy timeout. Synchronous calls to `caption` / `transcribe` / `compose` for anything substantial will time out at the proxy level.

Two options:
1. **Polling** (this template's default): tool returns `jobId`, agent polls `getJobStatus`. Works but adds latency.
2. **Webhook**: pass `webhookUrl` in the tool input, NCA POSTs to that URL when done. This template does NOT include a webhook receiver — clients host their own (typically Next.js API route or n8n/Make webhook).

### Polling cadence in agent instructions

The agent's instructions specify "wait 3 seconds between polls, max 30 polls." Mastra agents don't have built-in `sleep` between tool calls — the model decides when to call again. In practice, the agent calls `getJobStatus`, looks at the response, decides whether to call again. The 3-second delay is a hint to the model, not enforced.

If the agent polls too aggressively, NCA returns 429. The `ncaRequest` retry logic does NOT retry 429s (they're 4xx). The agent will see the 429 and back off naturally.

### `ffmpeg-compose` is the most flexible AND the most footgun-prone

The compose endpoint accepts arbitrary ffmpeg filter graphs and options. The Zod schema is permissive (`filter: z.string()`, `option: z.string()`) — we don't try to validate ffmpeg syntax in the agent.

Implication: a malformed filter graph will fail at NCA's ffmpeg layer, return a 500 with a stderr message. The agent will see the error message and report it. Not a problem, but expect confusing error messages from clients who don't know ffmpeg.

If a client wants stricter validation, they can extend the Zod schema with regex constraints on common patterns. Out of scope for this template.

### `getJobStatus` response shape varies by job type

NCA's job status endpoint returns different shapes depending on what kind of job was started. The `response` field is `unknown` in our schema — the agent reads it and reports based on context.

If a client wants tighter typing, they'd need separate `getCaptionJobStatus`, `getTranscribeJobStatus`, etc. with discriminated unions. Decided against for v1 — adds complexity for marginal type safety gain.

### NCA Toolkit deployment isn't included

This template POINTS AT an NCA deployment. Setting up NCA itself is documented in NCA's repo: https://github.com/stephengpope/no-code-architects-toolkit

Common deployment paths:
- Docker on a VPS (Hetzner, DigitalOcean, etc.)
- Google Cloud Run
- Digital Ocean App Platform

For the owner's testing, a local Docker NCA is simplest:
```
docker run -d -p 8080:8080 \
  -e API_KEY=test-key-123 \
  -e S3_ENDPOINT_URL=... \
  -e S3_ACCESS_KEY=... \
  -e S3_SECRET_KEY=... \
  -e S3_BUCKET_NAME=... \
  -e S3_REGION=... \
  no-code-architects-toolkit
```

Then `NCA_BASE_URL=http://localhost:8080` in our `.env`.

### CI cannot test against real NCA easily

The CI eval job runs against AIMock (text-mode assertions only). Setting up a real NCA for CI requires:
- Hosting an NCA test instance (long-lived, with test S3 bucket)
- Or: running NCA in a CI service container (lots of setup)

For v1, eval gates run against AIMock. Real NCA testing is local only. Document as an accepted limitation.

### S3 credentials are NCA's concern

This template's `.env` does NOT include S3 credentials. Why: the Mastra agent doesn't talk to S3 directly. NCA does. NCA holds the S3 creds.

Don't try to add `S3_ACCESS_KEY` etc. to this template's env — that's a footgun. Set them on the NCA deployment.

The exception: if a client wants the agent to also upload files to S3 (e.g., user-uploaded video → agent uploads to S3 → agent passes URL to NCA), THEN they'd add S3 creds to the agent. Not in v1 scope.

### Webhook receiver is a separate problem

`NCA_DEFAULT_WEBHOOK_URL` is exposed in env and propagated through tools, but this template does NOT include the webhook receiver. The receiver is typically:
- A Next.js API route (`/api/nca-webhook`)
- An n8n / Make webhook node
- A separate Express/Hono service

The receiver verifies the request came from NCA (NCA doesn't currently sign webhooks; you'd verify by IP allowlist or shared secret in the URL path), parses the result, and updates app state.

This is a per-client integration. Out of scope for the template.

### Idempotency: `requestId` is a hint, not a guarantee

NCA's endpoints accept an optional `id` field in the request body. We expose this as `requestId`. NCA includes it in the response and in webhook callbacks for correlation.

It is NOT idempotency — sending the same `requestId` twice will trigger the operation twice. If you need idempotency (e.g., retrying a failed webhook), do it at the application layer with a deduplication store keyed on `requestId`.

### Cost considerations

NCA's costs are a function of:
- Compute (whatever you pay for your NCA deployment — Hetzner $5/mo VPS, GCP Cloud Run, etc.)
- S3 storage (whatever your S3 bill is)
- LLM costs are NCA's concern only for endpoints that use LLMs (transcribe via Whisper internally — uses NCA's OpenAI key)

Our agent's costs:
- Anthropic API for the agent model itself
- Anthropic API for the `answerRelevancy` LLM judge during eval

A typical 30-second video transcription end-to-end costs:
- Agent: 2-3 Anthropic calls (~$0.005)
- NCA: Whisper transcription cost (NCA passes its own OpenAI cost — varies)
- Total: probably under $0.05 per request

Document for clients so they're not surprised.
