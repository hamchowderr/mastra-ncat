# 04 — Build Order

Strict order. Each phase has a verification checkpoint. Don't proceed past a failing checkpoint without flagging in `PROGRESS.md`.

## Phase 0: Fork base via degit

Same approach as RAG and voice templates:

1. Move existing SPEC out:
   ```
   cd C:\Users\HamCh\code\template-mastra-nca
   move SPEC SPEC.tmp
   ```
2. Run degit:
   ```
   npx degit hamchowderr/template-mastra-base . --force
   ```
3. Restore SPEC:
   ```
   rmdir /s /q SPEC
   move SPEC.tmp SPEC
   ```
4. Install:
   ```
   npm install
   ```

**Checkpoint**: `npm run typecheck` passes.

## Phase 1: Strip the lead-intake assets

Delete:
- `src/mastra/agents/_example.ts`
- `src/mastra/scorers/_example.scorers.ts`
- `src/mastra/scorers/datasets/_example.json`

Replace `src/mastra/index.ts` with a minimal compiling placeholder (commented-out agent/scorer registrations).

**Checkpoint**: `npm run typecheck` passes.

## Phase 2: Extend env loader

Per spec — add NCA vars (`NCA_BASE_URL`, `NCA_API_KEY`, `NCA_TIMEOUT_MS`, `NCA_RETRIES`, `NCA_HEALTHCHECK_ON_BOOT`, optional `NCA_DEFAULT_WEBHOOK_URL`).

Update `.env.example` per spec.

Update local `.env` with real values. Owner provides:
- `NCA_BASE_URL` — owner's deployed NCA Toolkit URL
- `NCA_API_KEY` — owner's NCA API key

**Checkpoint**:
- `npm run typecheck` passes
- Booting without `NCA_BASE_URL` produces a clear Zod error
- Booting with a trailing slash on `NCA_BASE_URL` produces a clear error

## Phase 3: NCA HTTP client

Write `src/mastra/lib/nca.ts` per spec.

**Checkpoint**: typecheck passes.

## Phase 4: Connectivity ping script

1. Write `scripts/nca-ping.ts` per spec.
2. Add `"nca:ping"` script to `package.json`.
3. Run:
   ```
   npm run nca:ping
   ```

**Checkpoint**:
- `✓ NCA Toolkit is reachable and API key is valid.` is printed
- Exit 0

If this fails:
- Verify `NCA_BASE_URL` is correct (try `curl https://your-nca-url/v1/toolkit/test -H "x-api-key: $NCA_API_KEY"`)
- Verify the API key is correct on the NCA deployment
- Verify network access (firewalls, etc.)

**Bonus probe — verify the job-status endpoint shape before Phase 5**:

```bash
curl -X POST "$NCA_BASE_URL/v1/toolkit/job/status" \
  -H "x-api-key: $NCA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"job_id": "probe-test-id"}'
```

Expected: a response (likely an error since the job ID is fake) with `"endpoint": "/v1/toolkit/job/status"` somewhere in the body. This confirms the path and request shape match the spec. If you get a clean 404 (HTML or "not found" message), the path has changed since the spec was written — STOP and report. Check `https://github.com/stephengpope/no-code-architects-toolkit/blob/main/docs/toolkit/job_status.md` for current shape.

Don't proceed until ping passes — every subsequent phase depends on NCA being reachable.

## Phase 5: Tools

Write all **20 tool files** in any order — each is a thin `createTool` over one NCA endpoint, routed through `ncaRequest`. Start with the five detailed in `03-files.md` (they're the reference implementations), then build the rest by copying the closest one (see the full table in `03-files.md` § Remaining NCA tools):

- **Toolkit**: `nca-test.ts`, `get-job-status.ts`, `get-jobs-status.ts`
- **Video**: `caption-video.ts`, `trim-video.ts`, `cut-video.ts`, `split-video.ts`, `concatenate-videos.ts`, `video-thumbnail.ts`
- **Audio**: `concatenate-audio.ts`
- **Media (generic)**: `transcribe-media.ts`, `cut-media.ts`, `convert-media.ts`, `convert-to-mp3.ts`, `media-metadata.ts`, `detect-silence.ts`, `generate-ass.ts`
- **Image**: `screenshot-webpage.ts`, `image-to-video.ts`
- **Compose**: `ffmpeg-compose.ts`

Per spec.

**Checkpoint**: typecheck passes for each of the 20. No tool calls `fetch` directly — all go through `ncaRequest`.

## Phase 6: Scorers

Write `src/mastra/scorers/_example.scorers.ts` per spec. Verify exact prebuilt names against `node_modules/@mastra/evals/dist/scorers/prebuilt/index.d.ts`.

**Checkpoint**: typecheck passes.

## Phase 7: Agents (mediaProcessor + supervisor fleet)

The degit fork in Phase 0 brings `src/mastra/lib/processors.ts` and `src/mastra/lib/memory.ts` over from base — no need to write them. Use them, don't re-create them.

Build order matters: sub-agents first (the supervisor imports them), then the supervisor.

1. Write `src/mastra/agents/_example.ts` (`mediaProcessor`) per spec — `memory: createDefaultMemory()` + shared `inputProcessors` / `outputProcessors`. Do NOT use bare `new Memory()`.
2. Write the 5 sub-agents — `video-agent.ts`, `audio-agent.ts`, `media-agent.ts`, `image-agent.ts`, `toolkit-agent.ts` — each per spec: its tool group + `getJobStatus`, the shared `inputProcessors` / `outputProcessors`, and **no `memory`** (stateless).
3. Write `src/mastra/agents/media-supervisor.ts` (`mediaSupervisor`) per spec — imports the 5 sub-agents and passes them via `agents: {...}`, plus `createDefaultMemory()` + shared processors.
4. Update `src/mastra/index.ts` to register all 7 agents + scorers, with optional health check at boot.

**Memory rule** (apply to any agent you add): conversational/top-level agents (`mediaProcessor`, `mediaSupervisor`) get `createDefaultMemory()`; delegated tool-agents (the 5 sub-agents) get the shared processors but stay **stateless** — the supervisor owns the conversation.

**Checkpoint**:
- typecheck passes
- `npm run dev` boots Studio without errors
- All 7 agents visible in Studio (`mediaProcessor`, `mediaSupervisor`, and the 5 sub-agents)
- Chatting with `mediaSupervisor` delegates: a video request reaches `videoAgent`, a health check reaches `toolkitAgent`

## Phase 8: Live smoke tests

In Studio, chat with `mediaProcessor`:

**Test A — health check**:
> Can you check if the NCA Toolkit is working?

Expected: agent calls `ncaTest`, returns success message with the test file URL.

**Test B — refuses local path**:
> Transcribe /Users/me/recording.m4a

Expected: agent does NOT call any tool. It explains that source media must be at a public URL.

**Test C — transcription**:
Owner provides a real public test video URL (short, ~10s, e.g., a sample from Mastra docs or owner's S3).

> Transcribe this video: <test-url>

Expected: agent calls `transcribeMedia`. If response is sync, agent reports the transcript. If queued, agent calls `getJobStatus` repeatedly until complete.

**Checkpoint**: All three tests pass. If C fails because the test asset isn't reachable, owner provides a different URL.

## Phase 9: Eval gate

1. Write `src/mastra/scorers/datasets/_example.json` per spec.
2. Update `scripts/eval.ts` to handle the schema (`expectedTool`, `expectedKeywords`) — same as voice template.
3. Run live:
   ```
   npm run eval
   ```

**Checkpoint**:
- All 5 cases run
- Tool-call assertions pass for cases that should call a tool
- "refuses local file path" case has `expectedTool: null` and the agent doesn't call any tool
- Scorers ≥ thresholds
- Exit 0

## Phase 10: AIMock eval

Same pattern as voice template — agent on Anthropic, scorers disabled under AIMock.

```
npx @copilotkit/aimock --port 4010
USE_AIMOCK=true AIMOCK_URL=http://localhost:4010 npm run eval
```

**Checkpoint**:
- Tool-call/keyword assertions evaluated
- Scorers skipped (n/a)
- Exit 0 if assertions pass

If AIMock has no fixtures for the tool-call format, assertions for cases 1-3 may fail. Document in PROGRESS.md per voice template's pattern.

## Phase 11: Docker

```
docker build -t template-mastra-nca:test .
docker compose up -d
sleep 15
curl http://localhost:4111/health
docker compose logs --tail=50 mastra
docker compose down
```

**Checkpoint**: container builds, starts, /health returns 200.

If `NCA_HEALTHCHECK_ON_BOOT=true` in container env, the container will fail to start unless NCA is reachable from the container. For testing the Docker build itself, set it to `false`.

## Phase 12: CI workflow

Update `.github/workflows/ci.yml`:
- Add `NCA_BASE_URL: https://stub-nca.example.com` and `NCA_API_KEY: stub-nca-key` to all env blocks
- Eval job runs against AIMock as before

**Checkpoint**: verified at PR time after publish.

## Phase 13: Documentation

1. Rewrite `README.md` for NCA template
2. Update `AGENTS.md` with NCA conventions (use `ncaRequest`, never call fetch directly to NCA, tools take URLs)
3. Write `prompts/build-nca-tool.md` (parameterized prompt for adding new endpoint wrappers)
4. Update `prompts/README.md` index

**Checkpoint**: a new dev can run quickstart end-to-end from README.

## Phase 14: Final verification

Run through `05-verification.md` end-to-end. Document any failures in `PROGRESS.md`.
