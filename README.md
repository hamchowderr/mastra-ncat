# template-mastra-nca

A production-ready Mastra agent template for the [NCA Toolkit](https://github.com/stephengpope/no-code-architects-toolkit) — Stephen Pope's self-hosted media-processing API. Five tool wrappers (caption video, transcribe audio/video, ffmpeg compose, job status, health check), an async job-polling pattern, and a full eval pipeline out of the box.

---

## Quickstart (5 minutes)

**Prerequisites**: Node 22+, Docker Desktop, a running NCA Toolkit instance, a Supabase project, an Anthropic API key.

```bash
# 1. Clone and install
git clone <repo> my-nca-agent && cd my-nca-agent
npm install

# 2. Configure environment
cp .env.example .env
# Fill in: APP_SECRET, SUPABASE_*, ANTHROPIC_API_KEY, NCA_BASE_URL, NCA_API_KEY

# 3. Start local Supabase (first time only)
npx supabase start

# 4. Verify NCA is reachable
npm run nca:ping

# 5. Run
npm run dev
# → Mastra Studio at http://localhost:4111
```

Chat with the `mediaProcessor` agent in Studio to verify everything works. Send:

> Transcribe this video: https://example.com/sample.mp4

Expected: agent calls `transcribeMedia`, either returns a transcript directly or polls `getJobStatus` until complete.

---

## NCA Toolkit

This template requires a deployed instance of [NCA Toolkit](https://github.com/stephengpope/no-code-architects-toolkit). NCA is a self-hosted FastAPI service that processes media via ffmpeg and Whisper, storing outputs in S3-compatible storage (AWS S3, MinIO, DigitalOcean Spaces, etc.).

Deploy NCA separately, then point `NCA_BASE_URL` at it. The template does not bundle NCA.

**Local NCA with MinIO** (development):
```bash
docker run -d --name nca-toolkit \
  -p 8080:8080 \
  -e API_KEY=local-dev-key-123 \
  -e S3_ENDPOINT_URL=http://minio:9000 \
  -e S3_ACCESS_KEY=minioadmin \
  -e S3_SECRET_KEY=minioadmin123 \
  -e S3_BUCKET_NAME=my-bucket \
  stephengpope/no-code-architects-toolkit:latest
```

Verify: `npm run nca:ping`

---

## File Structure

```
template-mastra-nca/
├── src/
│   ├── lib/
│   │   └── env.ts                  # Zod-validated env loader — crashes on bad config
│   └── mastra/
│       ├── index.ts                # Entry point: env → AIMock → NCA health check → Mastra
│       ├── agents/
│       │   └── _example.ts         # mediaProcessor agent — copy this for new agents
│       ├── lib/
│       │   ├── aimock.ts           # Routes LLM calls to AIMock when USE_AIMOCK=true
│       │   ├── nca.ts              # NCA HTTP client — all tools use this, never fetch directly
│       │   └── supabase.ts         # Supabase client factory
│       ├── scorers/
│       │   ├── _example.scorers.ts # answerRelevancy scorer + createToolCallAccuracyScorerCode export
│       │   └── datasets/
│       │       └── _example.json   # Eval dataset — 5 cases with thresholds
│       └── tools/
│           ├── nca-test.ts         # GET /v1/toolkit/test
│           ├── caption-video.ts    # POST /v1/video/caption
│           ├── transcribe-media.ts # POST /v1/media/transcribe
│           ├── ffmpeg-compose.ts   # POST /v1/ffmpeg/compose
│           └── get-job-status.ts   # POST /v1/toolkit/job/status
├── scripts/
│   ├── eval.ts                     # Offline CI eval gate — exits 0/1 based on thresholds
│   └── nca-ping.ts                 # NCA connectivity check
├── prompts/
│   ├── README.md                   # Index of agent-building prompts
│   ├── build-agent.md              # Parameterized prompt for adding a new agent
│   └── build-nca-tool.md           # Parameterized prompt for wrapping a new NCA endpoint
├── fixtures/
│   └── media-processor.json        # AIMock fixtures for CI eval
├── .github/
│   └── workflows/
│       └── ci.yml                  # typecheck → build + eval (parallel) → docker
├── Dockerfile                      # Multi-stage, node:22-slim runtime
├── docker-compose.yml              # Production compose
├── aimock.json                     # AIMock config pointing to fixtures/
├── .env.example                    # All required env vars with comments
└── AGENTS.md                       # Conventions for AI coding agents
```

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start Mastra Studio at localhost:4111 |
| `npm run build` | Bundle for production (output → `.mastra/output/`) |
| `npm run start` | Start production server (no Studio) |
| `npm run nca:ping` | Verify NCA is reachable and API key is valid |
| `npm run eval` | Run offline eval gate against all cases in the dataset |
| `npm run typecheck` | TypeScript type check (zero-emit) |
| `npm run score:list` | List registered scorers |

---

## Tools

| Tool | NCA Endpoint | When to use |
|---|---|---|
| `ncaTest` | `GET /v1/toolkit/test` | Verify deployment is healthy |
| `captionVideo` | `POST /v1/video/caption` | Burn captions into a video |
| `transcribeMedia` | `POST /v1/media/transcribe` | Speech-to-text on audio or video |
| `ffmpegCompose` | `POST /v1/ffmpeg/compose` | Arbitrary ffmpeg pipeline from URL inputs |
| `getJobStatus` | `POST /v1/toolkit/job/status` | Poll a long-running job |

**All source media must be at publicly-accessible URLs.** NCA fetches input files from URLs — it does not accept file uploads.

**Polling pattern**: Long operations return `status: "queued"` with a `job_id`. The agent polls `getJobStatus` every ~3s, up to 30 polls (~90s). This avoids Cloudflare's 60s proxy timeout.

---

## Adding a New NCA Tool

1. Find the NCA endpoint in [NCA's docs](https://github.com/stephengpope/no-code-architects-toolkit/tree/main/docs)
2. Use `prompts/build-nca-tool.md` with Claude Code: fill in endpoint path, request/response shapes, and sync/async expectation
3. Import `ncaRequest` from `../lib/nca` — never call `fetch` directly to NCA endpoints
4. Register the new tool in `src/mastra/agents/_example.ts` and add eval cases

---

## Running Evals

```bash
# Against live Anthropic API (incurs cost)
npm run eval

# Against AIMock (deterministic, no API cost)
npx @copilotkit/aimock -c aimock.json &
USE_AIMOCK=true AIMOCK_URL=http://localhost:4010 npm run eval

# Custom dataset
node --env-file=.env --import tsx/esm scripts/eval.ts path/to/dataset.json
```

---

## Docker

```bash
# Build
docker build -t my-nca-agent:latest .

# Run
docker compose up -d

# Health check
curl http://localhost:4111/health
```

> **NCA_HEALTHCHECK_ON_BOOT**: If set to `true`, the container will ping NCA at startup and crash if it's unreachable. For Docker testing without NCA, set `NCA_HEALTHCHECK_ON_BOOT=false`.

> **Local Supabase note**: Docker containers can't reach `127.0.0.1` on the host. Set `SUPABASE_DB_URL` to use `host.docker.internal` instead.

---

## Deployment Notes

The production image is ~676MB (node:22-slim/Debian) because DuckDB native binaries segfault on Alpine/musl. See the base template README for details on swapping DuckDB for LibSQL if image size matters.

---

## Common Gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `Invalid environment variables` on boot | Missing NCA_BASE_URL or NCA_API_KEY | Check against `.env.example` |
| `✗ NCA ping failed` | NCA unreachable or key invalid | Verify `NCA_BASE_URL` (no trailing slash), check NCA container logs |
| NCA returns 400 on GET | Sending Content-Type on GET requests | `nca.ts` already fixes this — don't send Content-Type without a body |
| NCA returns 404 for job status | Unknown job ID | `get-job-status.ts` catches this and returns `status: "failed"` |
| Agent keeps polling forever | Job stuck in NCA | Max 30 polls (~90s) per agent instructions; report failure to user after that |
| `ECONNREFUSED 127.0.0.1:54322` | Local Supabase not running | `npx supabase start` |
| Docker crashes (SIGSEGV) | DuckDB requires glibc | Use `node:22-slim`, not Alpine |

---

## Environment Variables

See `.env.example` for the full list with comments. NCA-specific vars:

- `NCA_BASE_URL` — URL of your NCA instance, **no trailing slash**. Example: `http://localhost:8080`
- `NCA_API_KEY` — The `API_KEY` env var configured on your NCA deployment
- `NCA_TIMEOUT_MS` — Per-request timeout in ms (default: 60000, matches Cloudflare proxy limit)
- `NCA_RETRIES` — Retries for 5xx/network errors, never 4xx (default: 3)
- `NCA_HEALTHCHECK_ON_BOOT` — Ping NCA at startup; crash if unreachable (default: false)
- `NCA_DEFAULT_WEBHOOK_URL` — Optional: default webhook for async job completion

---

## For AI Coding Agents

See `AGENTS.md` for conventions, boot order, import rules, and things to never do.
