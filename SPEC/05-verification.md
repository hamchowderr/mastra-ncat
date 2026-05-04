# 05 — Verification

End-to-end test plan. Run after the build is complete.

## Setup

- Real Supabase project (or local Supabase)
- A deployed NCA Toolkit instance reachable at the configured `NCA_BASE_URL`
- Real `NCA_API_KEY` matching the NCA deployment's `API_KEY` env var
- Real `ANTHROPIC_API_KEY` (default agent model + scorer judge)
- A public test video URL (short, ~10-30s, MP4 format)
- Docker installed (Phase 11)

Create `.env`:
```
APP_SECRET=<openssl rand -hex 32>
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_DB_URL=...
ANTHROPIC_API_KEY=...
NCA_BASE_URL=https://your-nca.com
NCA_API_KEY=...
MASTRA_TELEMETRY_DISABLED=1
```

## Tests in order

### 1. Typecheck
`npm run typecheck` → zero errors.

### 2. NCA connectivity
`npm run nca:ping` → `✓ NCA Toolkit is reachable and API key is valid.`

If this fails, fix before proceeding. Common fixes:
- Trailing slash on `NCA_BASE_URL` (must NOT have one)
- Wrong API key
- NCA deployment is down or unreachable from your network

### 3. Dev boot
`npm run dev` → Studio at localhost:4111, `mediaProcessor` agent listed.

### 4. Health check tool (Studio)
Send: "Can you check if the NCA Toolkit is working?"

**Pass**:
- Agent calls `ncaTest` (visible in trace)
- Response includes a confirmation that NCA is healthy
- Trace shows the test file URL returned by NCA

### 5. Refuses local file path
Send: "Transcribe /Users/me/recording.m4a"

**Pass**:
- Agent does NOT call any tool
- Response explains source must be a public URL

### 6. Real transcription
Owner provides a public test video URL.

Send: "Transcribe this video for me: <URL>"

**Pass** (sync case, short video):
- Agent calls `transcribeMedia`
- Response includes the transcript text
- Cost: depends on NCA's transcription costs (~$0.05 typical)

**Pass** (async case, longer video):
- Agent calls `transcribeMedia`, gets queued status with job_id
- Agent calls `getJobStatus` 1-30 times with delays between
- Eventually agent reports the transcript or a clear error

### 7. cURL test
```
curl -X POST http://localhost:4111/api/agents/mediaProcessor/generate \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Check NCA Toolkit health"}]}'
```

**Pass**: HTTP 200, response mentions NCA test file URL.

### 8. Eval gate (live)
`npm run eval` → 5/5 cases pass, scorers ≥ thresholds, exit 0.

**Cost**: ~$0.20 (5 cases × scorer judge calls).

### 9. Eval gate (AIMock)
```
npx @copilotkit/aimock --port 4010
USE_AIMOCK=true AIMOCK_URL=http://localhost:4010 npm run eval
```

**Pass**: assertion-only mode runs. Some cases may fail under AIMock if fixtures aren't configured for tool-call flows — document in PROGRESS.md.

### 10. Mastra build
`npm run build` → `.mastra/output/index.mjs` produced, exit 0.

### 11. Docker build & run
```
docker build -t template-mastra-nca:test .
docker compose up -d
sleep 15
curl http://localhost:4111/health
docker compose logs --tail=50 mastra
docker compose down
```

**Pass**: container builds, starts, /health returns 200.

### 12. Onboarding test
Open README, follow quickstart from clone to working agent. Should be under 10 minutes.

**Pass**: a new dev can boot the agent end-to-end from README alone.

## Reporting

Standard `PROGRESS.md` format. Be especially detailed on Phase 8/Test 6 — the real transcription test is the highest-value validation.
