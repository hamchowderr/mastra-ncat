# 03 — File Specifications

Each section specifies one file. Implement in the order given by `04-build-order.md`.

---

## `src/lib/env.ts` (extended from base)

**What to add to the existing schema**:

```typescript
// In the .object({...}) block, add these fields:
NCA_BASE_URL: z
  .string()
  .url('NCA_BASE_URL must be a valid URL')
  .refine((v) => !v.endsWith('/'), 'NCA_BASE_URL must not end with a trailing slash'),
NCA_API_KEY: z.string().min(1, 'NCA_API_KEY required'),

NCA_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(60000),
NCA_RETRIES: z.coerce.number().int().min(0).max(10).default(3),

NCA_HEALTHCHECK_ON_BOOT: z
  .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
  .transform((v) => v === 'true' || v === '1')
  .default('false'),

NCA_DEFAULT_WEBHOOK_URL: z.string().url().optional(),
```

`NCA_BASE_URL` and `NCA_API_KEY` are required (no `.optional()`). The template doesn't function without them.

**Acceptance criteria**:
- `npm run typecheck` passes
- Booting without `NCA_BASE_URL` or `NCA_API_KEY` produces a clear Zod error
- Trailing slash on `NCA_BASE_URL` rejected with a clear message

---

## `.env.example` (extended from base)

**What to add at the bottom**:

```bash
# ──────────────────────────────────────────────
# NCA Toolkit (required)
# ──────────────────────────────────────────────
# URL of your deployed NCA Toolkit instance. NO trailing slash.
# Examples: https://nca.your-domain.com  (hosted)
#           http://localhost:8080         (local docker)
NCA_BASE_URL=

# API key configured on your NCA Toolkit deployment (the API_KEY env var on the NCA side).
NCA_API_KEY=

# Per-request timeout in milliseconds. Default 60s matches NCA's Cloudflare proxy limit.
# Operations that exceed this should use polling via getJobStatus, OR set NCA_DEFAULT_WEBHOOK_URL.
NCA_TIMEOUT_MS=60000

# Retries for 5xx and network errors (NOT 4xx). Default 3.
NCA_RETRIES=3

# If true, ping NCA on Mastra startup; crash if unreachable.
# Useful in production for fail-fast on misconfig. Default false.
NCA_HEALTHCHECK_ON_BOOT=false

# Optional: default webhook URL for long-running operations.
# If unset, agents use polling via getJobStatus.
# NOTE: This template does NOT include a webhook receiver — you must host one elsewhere.
# NCA_DEFAULT_WEBHOOK_URL=https://your-webhook-endpoint.com/nca-callback
```

---

## `src/mastra/lib/nca.ts`

**Purpose**: Single source of truth for talking to NCA. Every tool wrapper uses `ncaRequest`. No tool talks to NCA directly via `fetch`.

**Behavior**:
- Reads `env.NCA_BASE_URL`, `NCA_API_KEY`, `NCA_TIMEOUT_MS`, `NCA_RETRIES` for defaults
- Adds `x-api-key` header automatically
- Uses `AbortController` for timeout
- Retries on 5xx and network errors with exponential backoff (100ms, 200ms, 400ms... up to retries limit)
- Does NOT retry 4xx — those are caller bugs
- Throws `NcaError` with status, body, and request context on failure
- Returns parsed JSON typed as `T`

**Implementation**:

```typescript
import { env } from '../../lib/env';

export class NcaError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    public path: string,
    message: string,
  ) {
    super(message);
    this.name = 'NcaError';
  }
}

export interface NcaRequestOptions {
  /** GET, POST, etc. Default 'POST'. */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Override timeout for this request. */
  timeoutMs?: number;
  /** Override retries for this request. */
  retries?: number;
}

/**
 * Make an authenticated request to the NCA Toolkit API.
 *
 * Handles auth, timeout, retries, and error shaping. Returns parsed JSON.
 *
 * Example:
 *   const result = await ncaRequest<{ job_id: string }>(
 *     '/v1/video/caption',
 *     { video_url: 'https://...', captions: '...' },
 *   );
 */
export async function ncaRequest<T>(
  path: string,
  body?: unknown,
  opts: NcaRequestOptions = {},
): Promise<T> {
  if (!path.startsWith('/')) {
    throw new Error(`NCA path must start with '/': ${path}`);
  }

  const method = opts.method ?? (body !== undefined ? 'POST' : 'GET');
  const timeoutMs = opts.timeoutMs ?? env.NCA_TIMEOUT_MS;
  const retries = opts.retries ?? env.NCA_RETRIES;
  const url = `${env.NCA_BASE_URL}${path}`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'x-api-key': env.NCA_API_KEY,
          'Content-Type': 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // 4xx — don't retry, surface immediately
      if (response.status >= 400 && response.status < 500) {
        const errBody = await safeJson(response);
        throw new NcaError(
          response.status,
          errBody,
          path,
          `NCA request failed with ${response.status}: ${JSON.stringify(errBody)}`,
        );
      }

      // 5xx — retry if attempts remain
      if (response.status >= 500) {
        const errBody = await safeJson(response);
        lastError = new NcaError(
          response.status,
          errBody,
          path,
          `NCA request failed with ${response.status}: ${JSON.stringify(errBody)}`,
        );
        if (attempt < retries) {
          await sleep(100 * 2 ** attempt);
          continue;
        }
        throw lastError;
      }

      return (await response.json()) as T;
    } catch (err) {
      clearTimeout(timeout);

      // Don't retry 4xx (NcaError with status < 500)
      if (err instanceof NcaError && err.status < 500) {
        throw err;
      }

      lastError = err;

      if (attempt < retries) {
        await sleep(100 * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error('NCA request failed (no attempts made)');
}

/**
 * Health check — calls /v1/toolkit/test.
 * Used at boot if NCA_HEALTHCHECK_ON_BOOT=true.
 * Throws if NCA is unreachable, key is invalid, or S3 isn't working.
 */
export async function ncaHealthcheck(): Promise<void> {
  await ncaRequest<{ code: number; response: string }>('/v1/toolkit/test', undefined, {
    method: 'GET',
    timeoutMs: 10_000, // tighter timeout for boot check
    retries: 1,
  });
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return await response.text().catch(() => null);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

**Acceptance criteria**:
- Typecheck passes
- `ncaHealthcheck()` exits cleanly when NCA is reachable with a valid key
- `ncaHealthcheck()` throws `NcaError` (with status) when key is invalid (401)
- 5xx responses retry up to `NCA_RETRIES` times before throwing
- 4xx responses throw immediately
- Timeout abortion produces an `AbortError` (Node's standard fetch behavior on timeout)

---

## `src/mastra/tools/nca-test.ts`

**Purpose**: Mastra tool wrapping `GET /v1/toolkit/test`. Lets the agent verify the NCA deployment is healthy. Useful for diagnostics in conversations.

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ncaRequest } from '../lib/nca';

export const ncaTest = createTool({
  id: 'ncaTest',
  description:
    'Verify the NCA Toolkit deployment is reachable, API key is valid, and storage is working. Returns the test file URL on success.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    testFileUrl: z.string().url().optional(),
    message: z.string(),
  }),
  execute: async () => {
    try {
      const result = await ncaRequest<{
        code: number;
        response: string;
        message: string;
      }>('/v1/toolkit/test', undefined, { method: 'GET' });

      return {
        success: result.code === 200,
        testFileUrl: result.code === 200 ? result.response : undefined,
        message: result.message,
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
});
```

---

## `src/mastra/tools/caption-video.ts`

**Purpose**: Wraps `POST /v1/video/caption`. Adds captions to a video URL.

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '../../lib/env';
import { ncaRequest } from '../lib/nca';

export const captionVideo = createTool({
  id: 'captionVideo',
  description:
    'Add captions to a video. Source video must be at a publicly-accessible URL. Returns a job_id for polling, or a result URL if synchronous.',
  inputSchema: z.object({
    videoUrl: z.string().url().describe('Public URL of the source video'),
    captions: z.string().describe('SRT-formatted caption text, OR a URL to an SRT file'),
    settings: z
      .object({
        font_size: z.number().int().positive().optional(),
        font_color: z.string().optional().describe('Hex or named color, e.g., #ffffff or white'),
        position: z.enum(['top', 'middle', 'bottom']).optional(),
      })
      .optional(),
    /** If set, NCA will POST to this URL when done instead of returning result inline. */
    webhookUrl: z.string().url().optional(),
    /** Caller-supplied request ID. Useful for log correlation. */
    requestId: z.string().optional(),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.enum(['queued', 'completed']),
    resultUrl: z.string().url().optional(),
    message: z.string(),
  }),
  execute: async ({ videoUrl, captions, settings, webhookUrl, requestId }) => {
    const body = {
      video_url: videoUrl,
      captions,
      ...(settings && { settings }),
      ...(webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL
        ? { webhook_url: webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL }
        : {}),
      ...(requestId && { id: requestId }),
    };

    const result = await ncaRequest<{
      code: number;
      job_id: string;
      response: string | null;
      message: string;
    }>('/v1/video/caption', body);

    // If response is a URL string, the operation completed synchronously.
    const isCompleted = typeof result.response === 'string' && result.response.startsWith('http');

    return {
      jobId: result.job_id,
      status: isCompleted ? 'completed' : 'queued',
      resultUrl: isCompleted ? result.response! : undefined,
      message: result.message,
    };
  },
});
```

**Note**: Schema for `settings` is intentionally permissive. NCA's caption settings have many options (line breaks, animation, etc.); the spec includes the most common three. Add more as clients need them.

---

## `src/mastra/tools/transcribe-media.ts`

**Purpose**: Wraps `POST /v1/media/transcribe`. Speech-to-text on audio or video URL.

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '../../lib/env';
import { ncaRequest } from '../lib/nca';

export const transcribeMedia = createTool({
  id: 'transcribeMedia',
  description:
    'Transcribe audio or video to text. Source must be at a publicly-accessible URL. Returns transcript or job_id.',
  inputSchema: z.object({
    mediaUrl: z.string().url().describe('Public URL of the source audio or video'),
    language: z.string().optional().describe('Optional language hint (ISO code, e.g., "en", "es")'),
    webhookUrl: z.string().url().optional(),
    requestId: z.string().optional(),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.enum(['queued', 'completed']),
    transcript: z.string().optional(),
    message: z.string(),
  }),
  execute: async ({ mediaUrl, language, webhookUrl, requestId }) => {
    const body = {
      media_url: mediaUrl,
      ...(language && { language }),
      ...(webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL
        ? { webhook_url: webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL }
        : {}),
      ...(requestId && { id: requestId }),
    };

    const result = await ncaRequest<{
      code: number;
      job_id: string;
      response: string | null;
      message: string;
    }>('/v1/media/transcribe', body);

    const isCompleted = typeof result.response === 'string' && result.response.length > 0;

    return {
      jobId: result.job_id,
      status: isCompleted ? 'completed' : 'queued',
      transcript: isCompleted ? result.response! : undefined,
      message: result.message,
    };
  },
});
```

---

## `src/mastra/tools/ffmpeg-compose.ts`

**Purpose**: Wraps `POST /v1/ffmpeg/compose`. Generic ffmpeg composition from URL inputs.

This endpoint is the most flexible (and most dangerous-to-misuse). NCA's payload schema for `compose` is rich; the wrapper exposes the structure as nested Zod for type safety.

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '../../lib/env';
import { ncaRequest } from '../lib/nca';

const inputSchema = z.object({
  /** Each input is a URL to a media file. */
  inputs: z
    .array(z.object({ url: z.string().url() }))
    .min(1, 'At least one input required'),
  /** ffmpeg filter graph string (e.g., "[0:v][1:v]concat=n=2:v=1:a=0[outv]"). */
  filters: z.array(z.object({ filter: z.string() })).optional(),
  /** Output settings: format, codec, etc. */
  outputs: z
    .array(
      z.object({
        options: z
          .array(
            z.object({
              option: z.string().describe('ffmpeg option flag (e.g., "-c:v")'),
              argument: z.string().describe('Value (e.g., "libx264")'),
            }),
          )
          .optional(),
      }),
    )
    .min(1, 'At least one output required'),
  webhookUrl: z.string().url().optional(),
  requestId: z.string().optional(),
});

export const ffmpegCompose = createTool({
  id: 'ffmpegCompose',
  description:
    'Run an arbitrary ffmpeg composition. Inputs are public URLs. Outputs are uploaded to NCA storage. Returns job_id for polling.',
  inputSchema,
  outputSchema: z.object({
    jobId: z.string(),
    status: z.enum(['queued', 'completed']),
    resultUrls: z.array(z.string().url()).optional(),
    message: z.string(),
  }),
  execute: async ({ inputs, filters, outputs, webhookUrl, requestId }) => {
    const body = {
      inputs,
      ...(filters && filters.length > 0 && { filters }),
      outputs,
      ...(webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL
        ? { webhook_url: webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL }
        : {}),
      ...(requestId && { id: requestId }),
    };

    const result = await ncaRequest<{
      code: number;
      job_id: string;
      response: string[] | null;
      message: string;
    }>('/v1/ffmpeg/compose', body);

    const isCompleted =
      Array.isArray(result.response) && result.response.length > 0;

    return {
      jobId: result.job_id,
      status: isCompleted ? 'completed' : 'queued',
      resultUrls: isCompleted ? result.response! : undefined,
      message: result.message,
    };
  },
});
```

---

## `src/mastra/tools/get-job-status.ts`

**Purpose**: Wraps `POST /v1/toolkit/job/status`. Used for polling long-running operations.

**Important — endpoint shape verified from NCA docs**:
- Method: **POST** (not GET, despite the verb-like nature of "status")
- Path: `/v1/toolkit/job/status` — singular `job`, not `jobs/{id}`
- The `job_id` is sent in the request **body**, not as a path/query parameter
- This was a known correction during spec authoring; the agent must verify the exact body shape during Phase 4 (connectivity test) before finalizing this tool

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ncaRequest } from '../lib/nca';

export const getJobStatus = createTool({
  id: 'getJobStatus',
  description:
    'Check the status of a previously-started NCA job. Use this after captionVideo, transcribeMedia, or ffmpegCompose return status="queued".',
  inputSchema: z.object({
    jobId: z.string().describe('The job_id returned from a previous NCA tool call'),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.enum(['queued', 'running', 'completed', 'failed']),
    response: z.unknown().optional().describe('The result payload (URL or transcript) once complete'),
    error: z.string().optional(),
    message: z.string(),
  }),
  execute: async ({ jobId }) => {
    // POST with job_id in request body — NCA's documented shape
    const result = await ncaRequest<{
      code: number;
      job_id: string;
      status?: string;
      response?: unknown;
      message: string;
    }>('/v1/toolkit/job/status', { job_id: jobId });

    // NCA's status field naming varies slightly across endpoints; normalize.
    const status =
      (result.status as 'queued' | 'running' | 'completed' | 'failed' | undefined) ??
      (result.code === 200 && result.response ? 'completed' : 'queued');

    return {
      jobId: result.job_id,
      status,
      response: result.response,
      error: status === 'failed' ? result.message : undefined,
      message: result.message,
    };
  },
});
```

**Verification step before finalizing this tool**: After Phase 4 (connectivity test) passes, run a quick manual probe to confirm the body shape:

```bash
curl -X POST "$NCA_BASE_URL/v1/toolkit/job/status" \
  -H "x-api-key: $NCA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"job_id": "any-test-id"}'
```

If the response includes `"endpoint": "/v1/toolkit/job/status"` (even if it errors because the job_id is fake), the path and body shape are correct. If you get a 404, the path is wrong — check NCA's `docs/toolkit/job_status.md` in the source repo for current shape and update accordingly.

**Note on the polling pattern**: Mastra agents implement polling via tool composition — the agent calls `getJobStatus` repeatedly with a delay between calls. The agent's instructions tell it the polling cadence (every 2-5 seconds, max 30 attempts). We don't bake retry-with-delay into the tool itself, because that would block the agent's reasoning loop.

---

## `src/mastra/agents/_example.ts`

**Purpose**: Production media-processing agent. Demonstrates all 5 tools and the polling pattern.

```typescript
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';

import { ncaTest } from '../tools/nca-test';
import { captionVideo } from '../tools/caption-video';
import { transcribeMedia } from '../tools/transcribe-media';
import { ffmpegCompose } from '../tools/ffmpeg-compose';
import { getJobStatus } from '../tools/get-job-status';
import {
  toolCallAccuracyScorer,
  answerRelevancyScorer,
} from '../scorers/_example.scorers';
import { env } from '../../lib/env';

/**
 * # Media Processor Agent (canonical example)
 *
 * What it does:
 *   Processes media via the NCA Toolkit. Captions videos, transcribes audio,
 *   composes ffmpeg pipelines. Polls long-running jobs via getJobStatus.
 *
 * Who calls it:
 *   - Studio chat (development)
 *   - Next.js API routes / n8n webhooks
 *   POST /api/agents/mediaProcessor/generate
 *
 * Env vars required:
 *   - NCA_BASE_URL, NCA_API_KEY
 *   - ANTHROPIC_API_KEY (default agent model)
 *
 * How to test:
 *   curl -X POST http://localhost:4111/api/agents/mediaProcessor/generate \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *       "messages": [{
 *         "role": "user",
 *         "content": "Transcribe this video: https://example.com/sample.mp4"
 *       }]
 *     }'
 *
 * Pre-flight:
 *   Ensure NCA is reachable: `npm run nca:ping`
 */

export const mediaProcessorAgent = new Agent({
  id: 'mediaProcessor',
  name: 'Media Processor',
  instructions: `You process media files (video, audio) by calling NCA Toolkit tools.

Available operations:
- captionVideo: add captions to a video
- transcribeMedia: convert audio/video to text
- ffmpegCompose: arbitrary ffmpeg composition
- ncaTest: verify NCA deployment is healthy
- getJobStatus: poll a previously-started job

Rules:
- ALL source media MUST be at publicly-accessible URLs. If the user provides a local file path, refuse and ask for a URL.
- For long-running operations (captioning a long video, complex ffmpeg), the tool will return status="queued" with a job_id. Use getJobStatus to poll. Wait 3 seconds between polls. Max 30 polls (~90 seconds).
- If a job returns status="failed", report the error to the user. Do not retry automatically.
- When in doubt about the deployment, call ncaTest first to verify connectivity.
- Be explicit about what you're doing in your responses (e.g., "Starting transcription... job_id: abc-123. Polling..."). Users want to see progress.
- Cite the result URL when an operation completes.`,
  model: 'anthropic/claude-haiku-4-5',
  tools: { ncaTest, captionVideo, transcribeMedia, ffmpegCompose, getJobStatus },
  memory: new Memory(),
  scorers: {
    toolCallAccuracy: {
      scorer: toolCallAccuracyScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
    answerRelevancy: {
      scorer: answerRelevancyScorer,
      sampling: { type: 'ratio', rate: env.USE_AIMOCK ? 0 : 1 },
    },
  },
});
```

The `env.USE_AIMOCK ? 0 : 1` pattern for `answerRelevancy` matches what the voice template settled on (the LLM-judged scorer can't be mocked usefully).

---

## `src/mastra/scorers/_example.scorers.ts`

Same pattern as voice template:

```typescript
import {
  createToolCallAccuracyScorerCode,
  createAnswerRelevancyScorerLLM,
} from '@mastra/evals/scorers/prebuilt';

export const toolCallAccuracyScorer = createToolCallAccuracyScorerCode({
  strictMode: false,
});

export const answerRelevancyScorer = createAnswerRelevancyScorerLLM({
  model: 'anthropic/claude-haiku-4-5',
});
```

Verify exact prebuilt scorer names against `node_modules/@mastra/evals/dist/scorers/prebuilt/index.d.ts` before finalizing — the voice template's PROGRESS notes that some prebuilts had subtly different names.

---

## `src/mastra/scorers/datasets/_example.json`

Schema is the voice-template style (`expectedTool`, `expectedKeywords`):

```json
{
  "agentId": "mediaProcessor",
  "thresholds": {
    "toolCallAccuracy": 0.8,
    "answerRelevancy": 0.7
  },
  "cases": [
    {
      "name": "transcribe a video URL",
      "input": "Transcribe this video for me: https://example.com/test-video.mp4",
      "expectedTool": "transcribeMedia",
      "expectedKeywords": []
    },
    {
      "name": "caption a video",
      "input": "Add captions to https://example.com/sample.mp4 with this SRT: [test]",
      "expectedTool": "captionVideo",
      "expectedKeywords": []
    },
    {
      "name": "verify deployment",
      "input": "Can you check if the NCA Toolkit is working?",
      "expectedTool": "ncaTest",
      "expectedKeywords": []
    },
    {
      "name": "refuses local file path",
      "input": "Transcribe /Users/me/recording.m4a",
      "expectedTool": null,
      "expectedKeywords": ["url", "publicly"]
    },
    {
      "name": "polls a queued job",
      "input": "Check the status of job abc-123-def",
      "expectedTool": "getJobStatus",
      "expectedKeywords": []
    }
  ]
}
```

5 cases including positive tool-call cases AND a negative (refuses local file path).

---

## `scripts/nca-ping.ts`

**Purpose**: Standalone connectivity check. Runs `ncaHealthcheck` outside Mastra. Useful for fast diagnostics.

```typescript
import { ncaHealthcheck } from '../src/mastra/lib/nca';

async function main() {
  console.log('Pinging NCA Toolkit...');
  try {
    await ncaHealthcheck();
    console.log('✓ NCA Toolkit is reachable and API key is valid.');
    process.exit(0);
  } catch (err) {
    console.error('✗ NCA ping failed:');
    console.error(err);
    process.exit(1);
  }
}

main();
```

Add to `package.json`:
```json
"nca:ping": "node --env-file=.env --import tsx/esm scripts/nca-ping.ts"
```

The `node --env-file=.env --import tsx/esm` pattern matches what the voice template settled on for env-loading. It works with .env on disk; if the owner uses Infisical via CLI runtime injection (`infisical run -- npm run nca:ping`), .env can be empty and Infisical injects.

---

## `scripts/eval.ts` (extended from base)

Same pattern as voice template — `expectedTool` and `expectedKeywords` schema.

---

## `src/mastra/index.ts`

Per `02-architecture.md` boot order. Key additions vs base:
1. Import `ncaHealthcheck` from `./lib/nca`
2. Conditional health check at boot if `env.NCA_HEALTHCHECK_ON_BOOT`
3. Replace agent and scorer imports/registrations with NCA versions

---

## `package.json` updates

```json
{
  "scripts": {
    "dev": "mastra dev",
    "build": "mastra build",
    "start": "mastra start",
    "typecheck": "tsc --noEmit",
    "nca:ping": "node --env-file=.env --import tsx/esm scripts/nca-ping.ts",
    "eval": "node --env-file=.env --import tsx/esm scripts/eval.ts",
    "score:list": "mastra scorers list"
  }
}
```

No new dependencies. Node's built-in `fetch` is sufficient.

---

## `.github/workflows/ci.yml`

Same as voice template approach. Add to all env blocks:
```yaml
NCA_BASE_URL: https://stub-nca.example.com
NCA_API_KEY: stub-nca-key
```

The eval job runs against AIMock (no real NCA needed). The build job needs env stubs to pass Zod validation.

If you want CI to actually test against a running NCA, that requires either:
- A long-lived test NCA deployment (extra infra, fragile in CI)
- A mocked NCA service container (lots of work to maintain)

For v1, eval gates run against AIMock with text-mode assertions only. Live NCA testing is local.

---

## `prompts/build-nca-tool.md`

Adapt from base's `build-agent.md`. Key additions:
- Inputs: NCA endpoint path, request body shape, response shape, sync/async expectation
- Conventions: import `ncaRequest` from `../lib/nca`; never call `fetch` directly
- The async pattern (return `jobId` + `status`, agent polls separately)

---

## `README.md`, `AGENTS.md`, `prompts/README.md`

Adapt from base. Key additions:
- README: Quickstart includes `npm run nca:ping` as a verification step. Document that NCA Toolkit must be deployed separately, with a link to NCA's repo.
- AGENTS: NCA conventions section — never call `fetch` directly to NCA endpoints, always go through `ncaRequest`. Tools take URLs not file uploads.
- prompts/README: index `build-nca-tool.md`.
