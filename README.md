# template-mastra-nca

A production-ready Mastra agent template for the [NCA Toolkit](https://github.com/stephengpope/no-code-architects-toolkit) — Stephen Pope's self-hosted media-processing API. Five domain agents (video, audio, media, image, toolkit) plus a supervisor, 15 NCA tool wrappers, an async job-polling pattern, and a full eval pipeline out of the box.

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

Chat with the `mediaSupervisor` agent in Studio to verify everything works. Send:

> Transcribe this video: https://example.com/sample.mp4

Expected: supervisor delegates to `mediaAgent`, which calls `transcribeMedia`, and either returns a transcript directly or polls `getJobStatus` until complete.

---

## Reachability

Once the dev server is running (`npm run dev`), all seven agents in this template are reachable through four standard paths.

The agents are: `mediaProcessor`, `mediaSupervisor`, `videoAgent`, `audioAgent`, `mediaAgent`, `imageAgent`, `toolkitAgent`. Examples below use `mediaProcessor` — swap the agentId in the URL to address any of the others.

### REST API

Direct HTTP calls. The fastest path for n8n, Make, VAPI, LiveKit, or any HTTP-aware system.

```bash
curl -X POST http://localhost:4111/api/agents/mediaProcessor/generate \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Run an NCA health check"}]}'
```

For streaming responses, use `/stream` instead of `/generate`. Full OpenAPI spec at `/api/openapi.json`. Interactive docs at `/swagger-ui` (dev only).

### A2A (Agent-to-Agent Protocol)

Google's open standard for agent-to-agent communication. JSON-RPC over HTTP.

```bash
# Get agent card
curl http://localhost:4111/api/.well-known/mediaProcessor/agent-card.json

# Send a message (JSON-RPC)
curl -X POST http://localhost:4111/api/a2a/mediaProcessor \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":"1","method":"message/send","params":{"message":{"kind":"message","messageId":"msg-1","role":"user","parts":[{"kind":"text","text":"Run an NCA health check"}]}}}'
```

Use this when another agent (in CrewAI, LangGraph, ADK, or any A2A-compatible framework) needs to delegate media processing work to this template.

### MCP (Model Context Protocol)

Anthropic's open standard for agent-tool integration. The template's MCPServer exposes every agent as a callable tool at `/api/mcp/nca-mcp/mcp`.

To use from Claude Desktop, add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "template-mastra-nca": {
      "url": "http://localhost:4111/api/mcp/nca-mcp/mcp"
    }
  }
}
```

All seven agents appear as tools: `ask_mediaProcessor`, `ask_mediaSupervisor`, `ask_videoAgent`, `ask_audioAgent`, `ask_mediaAgent`, `ask_imageAgent`, `ask_toolkitAgent`. Note the URL uses the MCPServer `id` field (`nca-mcp`), not the config key in `src/mastra/index.ts` (`ncaMcp`).

**Testing MCP via curl**: The protocol is session-based — you must send `initialize` first and pass the returned `mcp-session-id` header in all subsequent calls. Omitting the session header causes `tools/list` to return an empty list.

```bash
# Step 1: initialize and capture session ID
SESSION=$(curl -si -X POST http://localhost:4111/api/mcp/nca-mcp/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' \
  | grep -i "mcp-session-id" | tr -d '\r' | awk '{print $2}')

# Step 2: list tools (pass session ID)
curl -s -X POST http://localhost:4111/api/mcp/nca-mcp/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2}'
```

### Studio (visual UI + Editor)

Open `http://localhost:4111` in a browser. Studio provides:

- Interactive chat with each agent
- Trace inspection for every run
- Metrics dashboard (cost, latency, errors)
- **Agent Editor**: Non-developers iterate on agent instructions, prompts, and tools without touching code.

---

## Agent Architecture

The template uses a supervisor + domain agent pattern that maps directly to NCA's API structure:

```
mediaSupervisor
├── videoAgent    → /v1/video/*   (caption, trim, concatenate, cut, split, thumbnail)
├── audioAgent    → /v1/audio/*   (concatenate)
├── mediaAgent    → /v1/media/*   (transcribe, ffmpeg, cut, ass, metadata, silence, convert, mp3)
├── imageAgent    → /v1/image/*   (screenshot, image-to-video)
└── toolkitAgent  → /v1/toolkit/* (test, job status, jobs status)
```

The supervisor routes requests to the appropriate domain agent without calling NCA tools directly. Domain agents own their tool set and poll `getJobStatus` for async operations.

---

## File Structure

```
template-mastra-nca/
├── src/
│   ├── lib/
│   │   └── env.ts                       # Zod-validated env loader — crashes on bad config
│   └── mastra/
│       ├── index.ts                     # Entry point: env → AIMock → NCA health → Mastra
│       ├── agents/
│       │   ├── _example.ts              # mediaProcessor agent — copy this for new agents
│       │   ├── media-supervisor.ts      # Supervisor: routes to domain agents
│       │   ├── video-agent.ts           # /v1/video/* tools
│       │   ├── audio-agent.ts           # /v1/audio/* tools
│       │   ├── media-agent.ts           # /v1/media/* tools
│       │   ├── image-agent.ts           # /v1/image/* tools
│       │   └── toolkit-agent.ts         # /v1/toolkit/* tools
│       ├── lib/
│       │   ├── aimock.ts                # Routes LLM calls to AIMock when USE_AIMOCK=true
│       │   ├── nca.ts                   # NCA HTTP client — all tools use this, never fetch directly
│       │   └── supabase.ts              # Supabase client factory
│       ├── scorers/
│       │   ├── _example.scorers.ts      # answerRelevancy scorer export
│       │   └── datasets/
│       │       ├── _example.json        # Eval dataset for mediaProcessor (5 cases)
│       │       ├── video-agent.json     # Eval dataset for videoAgent (4 cases)
│       │       ├── audio-agent.json     # Eval dataset for audioAgent (2 cases)
│       │       ├── media-agent.json     # Eval dataset for mediaAgent (5 cases)
│       │       ├── image-agent.json     # Eval dataset for imageAgent (2 cases)
│       │       ├── toolkit-agent.json   # Eval dataset for toolkitAgent (3 cases)
│       │       └── media-supervisor.json # Eval dataset for mediaSupervisor (5 cases)
│       └── tools/
│           ├── caption-video.ts         # POST /v1/video/caption
│           ├── trim-video.ts            # POST /v1/video/trim
│           ├── concatenate-videos.ts    # POST /v1/video/concatenate
│           ├── cut-video.ts             # POST /v1/video/cut
│           ├── split-video.ts           # POST /v1/video/split
│           ├── video-thumbnail.ts       # POST /v1/video/thumbnail
│           ├── concatenate-audio.ts     # POST /v1/audio/concatenate
│           ├── transcribe-media.ts      # POST /v1/media/transcribe
│           ├── ffmpeg-compose.ts        # POST /v1/ffmpeg/compose
│           ├── cut-media.ts             # POST /v1/media/cut
│           ├── generate-ass.ts          # POST /v1/media/ass
│           ├── media-metadata.ts        # POST /v1/media/metadata
│           ├── detect-silence.ts        # POST /v1/media/detect-silence
│           ├── convert-media.ts         # POST /v1/ffmpeg/convert
│           ├── convert-to-mp3.ts        # POST /v1/ffmpeg/convert/mp3
│           ├── screenshot-webpage.ts    # POST /v1/image/screenshot
│           ├── image-to-video.ts        # POST /v1/image/video
│           ├── nca-test.ts              # GET  /v1/toolkit/test
│           ├── get-job-status.ts        # POST /v1/toolkit/job/status
│           └── get-jobs-status.ts       # GET  /v1/toolkit/jobs/status
├── scripts/
│   ├── eval.ts                          # Run a single eval dataset; exits 0/1
│   ├── eval-all.ts                      # Run all datasets; exits 0/1 with summary
│   └── nca-ping.ts                      # NCA connectivity check
├── prompts/
│   ├── README.md                        # Index of agent-building prompts
│   ├── build-agent.md                   # Parameterized prompt for adding a new agent
│   └── build-nca-tool.md               # Parameterized prompt for wrapping a new NCA endpoint
├── fixtures/
│   ├── media-processor.json             # AIMock fixtures for mediaProcessor/_example
│   ├── video-agent.json                 # AIMock fixtures for videoAgent
│   ├── audio-agent.json                 # AIMock fixtures for audioAgent
│   ├── media-agent.json                 # AIMock fixtures for mediaAgent
│   ├── image-agent.json                 # AIMock fixtures for imageAgent
│   ├── toolkit-agent.json               # AIMock fixtures for toolkitAgent
│   └── media-supervisor.json            # AIMock fixtures for mediaSupervisor
├── .github/
│   └── workflows/
│       └── ci.yml                       # typecheck → build + eval:all (parallel) → docker
├── Dockerfile                           # Multi-stage, node:22-slim runtime
├── docker-compose.yml                   # Production compose
├── compose.dev.yml                      # Dev compose override
├── aimock.json                          # AIMock config pointing at fixtures/ directory
├── .env.example                         # All required env vars with comments
└── AGENTS.md                            # Conventions for AI coding agents
```

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start Mastra Studio at localhost:4111 |
| `npm run build` | Bundle for production (output → `.mastra/output/`) |
| `npm run start` | Start production server (no Studio) |
| `npm run nca:ping` | Verify NCA is reachable and API key is valid |
| `npm run eval` | Run one eval dataset (default: `_example.json`) |
| `npm run eval:all` | Run all 7 eval datasets; summarizes pass/fail |
| `npm run typecheck` | TypeScript type check (zero-emit) |
| `npm run score:list` | List registered scorers |

---

## Tools

### Video (`/v1/video/*`)

| Tool | NCA Endpoint | When to use |
|---|---|---|
| `captionVideo` | `POST /v1/video/caption` | Burn SRT captions into a video |
| `trimVideo` | `POST /v1/video/trim` | Trim to start/end timestamps |
| `concatenateVideos` | `POST /v1/video/concatenate` | Join multiple videos in order |
| `cutVideo` | `POST /v1/video/cut` | Cut clips from multiple timestamps |
| `splitVideo` | `POST /v1/video/split` | Split at regular intervals |
| `videoThumbnail` | `POST /v1/video/thumbnail` | Extract a frame as an image |

### Audio (`/v1/audio/*`)

| Tool | NCA Endpoint | When to use |
|---|---|---|
| `concatenateAudio` | `POST /v1/audio/concatenate` | Join multiple audio files |

### Media (`/v1/media/*` + ffmpeg)

| Tool | NCA Endpoint | When to use |
|---|---|---|
| `transcribeMedia` | `POST /v1/media/transcribe` | Speech-to-text on audio or video |
| `ffmpegCompose` | `POST /v1/ffmpeg/compose` | Arbitrary ffmpeg pipeline |
| `cutMedia` | `POST /v1/media/cut` | Cut clips by timestamp list |
| `generateAss` | `POST /v1/media/ass` | Generate ASS subtitle file |
| `mediaMetadata` | `POST /v1/media/metadata` | Get codec, resolution, duration |
| `detectSilence` | `POST /v1/media/detect-silence` | Find silent intervals |
| `convertMedia` | `POST /v1/ffmpeg/convert` | Convert format/codec |
| `convertToMp3` | `POST /v1/ffmpeg/convert/mp3` | Extract audio as MP3 |

### Image (`/v1/image/*`)

| Tool | NCA Endpoint | When to use |
|---|---|---|
| `screenshotWebpage` | `POST /v1/image/screenshot` | Capture a URL or HTML as PNG/JPEG |
| `imageToVideo` | `POST /v1/image/video` | Ken Burns zoom video from an image |

### Toolkit (`/v1/toolkit/*`)

| Tool | NCA Endpoint | When to use |
|---|---|---|
| `ncaTest` | `GET /v1/toolkit/test` | Verify NCA deployment is healthy |
| `getJobStatus` | `POST /v1/toolkit/job/status` | Poll a single long-running job |
| `getJobsStatus` | `GET /v1/toolkit/jobs/status` | List all recent job statuses |

**All source media must be at publicly-accessible URLs.** NCA fetches input files from URLs — it does not accept file uploads.

**Polling pattern**: Long operations return `status: "queued"` with a `job_id`. Domain agents poll `getJobStatus` every ~3s, up to 30 polls (~90s). This avoids Cloudflare's 60s proxy timeout.

---

## Adding a New NCA Tool

1. Find the NCA endpoint in [NCA's docs](https://github.com/stephengpope/no-code-architects-toolkit/tree/main/docs)
2. Use `prompts/build-nca-tool.md` with Claude Code: fill in endpoint path, request/response shapes, and sync/async expectation
3. Import `ncaRequest` from `../lib/nca` — never call `fetch` directly to NCA endpoints
4. Add the tool to the relevant domain agent's `tools:` map
5. Add eval cases to the matching dataset in `src/mastra/scorers/datasets/`
6. Add a two-turn AIMock fixture in `fixtures/<domain>-agent.json`

---

## Running Evals

```bash
# Against live Anthropic API (incurs cost)
npm run eval:all

# Against AIMock (deterministic, no API cost)
npx @copilotkit/aimock -c aimock.json &
USE_AIMOCK=true npm run eval:all

# Single dataset
node --env-file=.env --import tsx/esm scripts/eval.ts src/mastra/scorers/datasets/video-agent.json
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

> **NCA_HEALTHCHECK_ON_BOOT**: If set to `true`, the container will ping NCA at startup and crash if it's unreachable. Set `NCA_HEALTHCHECK_ON_BOOT=false` for Docker testing without a live NCA instance.

> **Local Supabase note**: Docker containers can't reach `127.0.0.1` on the host. Set `SUPABASE_DB_URL` to use `host.docker.internal` instead when running via Docker Desktop locally.

---

## Deployment Notes

The production image is ~676MB (node:22-slim/Debian) because DuckDB native binaries segfault on Alpine/musl. See the base template README for details on swapping DuckDB for LibSQL if image size matters.

---

## Common Gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `Invalid environment variables` on boot | Missing `NCA_BASE_URL` or `NCA_API_KEY` | Check against `.env.example` |
| `✗ NCA ping failed` | NCA unreachable or key invalid | Verify `NCA_BASE_URL` (no trailing slash), check NCA container logs |
| NCA returns 400 on GET | Sending Content-Type on GET requests | `nca.ts` already fixes this — don't send Content-Type without a body |
| NCA returns 404 for job status | Unknown job ID | `get-job-status.ts` catches this and returns `status: "failed"` |
| Agent keeps polling | Job stuck in NCA | Max 30 polls (~90s) per agent instructions; reports failure after that |
| `ECONNREFUSED 127.0.0.1:54322` | Local Supabase not running | `npx supabase start` |
| Docker crashes (SIGSEGV) | DuckDB requires glibc | Use `node:22-slim`, not Alpine |
| `ECONNREFUSED` inside Docker | `127.0.0.1` in DB URL | Replace with `host.docker.internal` |

---

## Environment Variables

See `.env.example` for the full list with comments. NCA-specific vars:

- `NCA_BASE_URL` — URL of your NCA instance, **no trailing slash**. Example: `http://localhost:8080`
- `NCA_API_KEY` — The `API_KEY` env var configured on your NCA deployment
- `NCA_TIMEOUT_MS` — Per-request timeout in ms (default: 60000, matches Cloudflare proxy limit)
- `NCA_RETRIES` — Retries for 5xx/network errors, never 4xx (default: 3)
- `NCA_HEALTHCHECK_ON_BOOT` — Ping NCA at startup; crash if unreachable (default: false)
- `NCA_DEFAULT_WEBHOOK_URL` — Optional: default webhook URL for async job completion notifications

Base vars (same as all templates):

- `APP_SECRET` — min 32 chars, generate with `openssl rand -hex 32`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`
- `ANTHROPIC_API_KEY`

---

## For AI Coding Agents

See `AGENTS.md` for conventions, boot order, import rules, and things to never do.
