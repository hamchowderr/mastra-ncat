# 02 — Architecture

## Final file layout

```
template-mastra-nca/
├── .env.example                          # Inherits base + NCA vars
├── .dockerignore                         # Inherited
├── .github/workflows/ci.yml              # Inherited; NCA tools mockable in CI
├── AGENTS.md                             # Inherits base + NCA conventions
├── CLAUDE.md                             # As in base
├── Dockerfile                            # Inherited
├── README.md                             # Rewritten for NCA template
├── compose.dev.yml                       # Inherited
├── docker-compose.yml                    # Inherited
├── package.json                          # Adds nca:ping script; no new deps
├── prompts/
│   ├── README.md                         # Updated index
│   ├── build-agent.md                    # From base
│   └── build-nca-tool.md                 # NEW — parameterized prompt for adding new NCA endpoint wrappers
├── scripts/
│   ├── eval.ts                           # Inherited; dataset path updated
│   └── nca-ping.ts                       # NEW — connectivity sanity check
├── src/
│   ├── lib/
│   │   └── env.ts                        # Extended (no breaking changes)
│   └── mastra/
│       ├── agents/
│       │   ├── _example.ts               # REPLACED — mediaProcessor (general-purpose, standalone)
│       │   ├── media-supervisor.ts       # NEW — mediaSupervisor; delegates to the 5 sub-agents
│       │   ├── video-agent.ts            # NEW — videoAgent sub-agent
│       │   ├── audio-agent.ts            # NEW — audioAgent sub-agent
│       │   ├── media-agent.ts            # NEW — mediaAgent sub-agent (generic transcode/ffmpeg/etc.)
│       │   ├── image-agent.ts            # NEW — imageAgent sub-agent
│       │   └── toolkit-agent.ts          # NEW — toolkitAgent sub-agent (health + job status)
│       ├── index.ts                      # Inherited; agent registration updated
│       ├── lib/
│       │   ├── aimock.ts                 # From base, unchanged
│       │   ├── memory.ts                 # From base — createDefaultMemory() working memory baseline
│       │   ├── nca.ts                    # NEW — typed HTTP client for NCA Toolkit
│       │   ├── processors.ts             # From base — shared default input/output processors
│       │   └── supabase.ts               # From base, unchanged
│       ├── scorers/
│       │   ├── _example.scorers.ts       # REPLACED — tool-call accuracy + answer relevancy
│       │   └── datasets/
│       │       └── _example.json         # REPLACED — NCA agent eval dataset
│       ├── tools/                        # 20 NCA Toolkit wrappers (one per endpoint)
│       │   ├── nca-test.ts               # /v1/toolkit/test — health check
│       │   ├── get-job-status.ts         # /v1/toolkit/job/status — poll one job
│       │   ├── get-jobs-status.ts        # /v1/toolkit/jobs/status — list all jobs
│       │   ├── caption-video.ts          # /v1/video/caption
│       │   ├── trim-video.ts             # /v1/video/trim
│       │   ├── cut-video.ts              # /v1/video/cut
│       │   ├── split-video.ts            # /v1/video/split
│       │   ├── concatenate-videos.ts     # /v1/video/concatenate
│       │   ├── video-thumbnail.ts        # /v1/video/thumbnail
│       │   ├── concatenate-audio.ts      # /v1/audio/concatenate
│       │   ├── transcribe-media.ts       # /v1/media/transcribe
│       │   ├── cut-media.ts              # /v1/media/cut
│       │   ├── convert-media.ts          # /v1/media/convert
│       │   ├── convert-to-mp3.ts         # /v1/media/convert/mp3
│       │   ├── media-metadata.ts         # /v1/media/metadata
│       │   ├── detect-silence.ts         # /v1/media/silence
│       │   ├── generate-ass.ts           # /v1/media/generate/ass
│       │   ├── screenshot-webpage.ts     # /v1/image/screenshot/webpage
│       │   ├── image-to-video.ts         # /v1/image/convert/video
│       │   └── ffmpeg-compose.ts         # /v1/ffmpeg/compose
│       └── workflows/                    # Empty
└── tsconfig.json                         # Inherited
```

## Files to delete from base

- `src/mastra/agents/_example.ts`
- `src/mastra/scorers/_example.scorers.ts`
- `src/mastra/scorers/datasets/_example.json`

## Final dependency list

### Inherited from base
All base deps. Critically: no new HTTP client needed — Node's built-in `fetch` is sufficient.

### To add (production)
**NONE.** This is intentional. Lean wrapper, no SDK dependency.

### NOT to install
- `axios` / `node-fetch` / `got` — Node's built-in `fetch` (Node 22+) is sufficient
- An "NCA SDK" package — none exists, and we don't want to maintain one inside this template
- File upload libraries — NCA takes URLs, not file uploads

## Final env vars (additions on top of base)

### Required to boot
- `NCA_BASE_URL` — URL of your NCA Toolkit deployment (e.g., `https://nca.your-domain.com`). MUST not have trailing slash. Validated as URL.
- `NCA_API_KEY` — Value of NCA's `x-api-key` header.

### Optional (NCA-specific)
- `NCA_TIMEOUT_MS` — Per-request timeout in ms (default: `60000` = 60s, matching Cloudflare proxy limit)
- `NCA_RETRIES` — Number of retries for 5xx/network errors (default: `3`)
- `NCA_HEALTHCHECK_ON_BOOT` — If `true`, ping NCA on Mastra startup; crash if unreachable. Default: `false`. Useful in production deploys to fail-fast on misconfig.
- `NCA_DEFAULT_WEBHOOK_URL` — Optional webhook URL for long-running operations. If unset, agent uses polling. (Webhook receiver is NOT included in this template; setting this assumes you're hosting one elsewhere.)

## Component map

| Component | File | Job |
|---|---|---|
| Env loader extension | `src/lib/env.ts` | Adds `NCA_BASE_URL`, `NCA_API_KEY`, optional NCA settings |
| Memory baseline | `src/mastra/lib/memory.ts` | From base. `createDefaultMemory()`: working memory ON (resource-scoped), semantic recall OFF. Used by `mediaProcessor` + `mediaSupervisor`; sub-agents are stateless (no memory). |
| Processor baseline | `src/mastra/lib/processors.ts` | From base. `defaultInputProcessors` (UnicodeNormalizer) + `defaultOutputProcessors` (TokenLimiter); model-backed safety processors present-but-commented (opt-in). Spread into ALL agents incl. sub-agents. |
| HTTP client | `src/mastra/lib/nca.ts` | Single function: `ncaRequest<T>(path, body, opts)`. Handles auth, retries, timeout, type safety. |
| NCA tool wrappers (20) | `src/mastra/tools/*.ts` | One thin `createTool` per NCA Toolkit endpoint, all routed through `nca.ts`. Toolkit: `ncaTest`, `getJobStatus`, `getJobsStatus`. Video: `captionVideo`, `trimVideo`, `cutVideo`, `splitVideo`, `concatenateVideos`, `videoThumbnail`. Audio: `concatenateAudio`. Media (generic): `transcribeMedia`, `cutMedia`, `convertMedia`, `convertToMp3`, `mediaMetadata`, `detectSilence`, `generateAss`. Image: `screenshotWebpage`, `imageToVideo`. Plus `ffmpegCompose` (arbitrary pipeline). Full table in `03-files.md`. |
| `mediaProcessor` agent | `src/mastra/agents/_example.ts` | Standalone general-purpose agent (id `mediaProcessor`). Tools: `ncaTest`, `captionVideo`, `transcribeMedia`, `ffmpegCompose`, `getJobStatus`. Demonstrates the polling pattern. Uses `createDefaultMemory()` + shared processors + answer-relevancy scorer. |
| `mediaSupervisor` agent | `src/mastra/agents/media-supervisor.ts` | Orchestrator (id `mediaSupervisor`). Holds the 5 sub-agents via `agents: {...}` and delegates by domain. No tools of its own. Uses `createDefaultMemory()` + shared processors + answer-relevancy scorer. |
| `videoAgent` sub-agent | `src/mastra/agents/video-agent.ts` | Video ops: caption, trim, concatenate, cut, split, thumbnail. Tools: `captionVideo`, `trimVideo`, `concatenateVideos`, `cutVideo`, `splitVideo`, `videoThumbnail`, `getJobStatus`. Processors only — **no memory** (stateless). |
| `audioAgent` sub-agent | `src/mastra/agents/audio-agent.ts` | Audio ops: join audio tracks. Tools: `concatenateAudio`, `getJobStatus`. Processors only — **no memory**. |
| `mediaAgent` sub-agent | `src/mastra/agents/media-agent.ts` | Generic media ops: transcribe, ffmpeg, cut, ASS subtitles, metadata, silence detection, format/MP3 conversion. Tools: `transcribeMedia`, `ffmpegCompose`, `cutMedia`, `generateAss`, `mediaMetadata`, `detectSilence`, `convertMedia`, `convertToMp3`, `getJobStatus`. Processors only — **no memory**. |
| `imageAgent` sub-agent | `src/mastra/agents/image-agent.ts` | Image ops: webpage screenshot, image-to-video (Ken Burns). Tools: `screenshotWebpage`, `imageToVideo`, `getJobStatus`. Processors only — **no memory**. |
| `toolkitAgent` sub-agent | `src/mastra/agents/toolkit-agent.ts` | Utility ops: health check, single + bulk job status. Tools: `ncaTest`, `getJobStatus`, `getJobsStatus`. Processors only — **no memory**. |
| Scorers | `src/mastra/scorers/_example.scorers.ts` | Tool-call accuracy + answer relevancy |
| Eval dataset | `src/mastra/scorers/datasets/_example.json` | Canonical media-processing requests with expected tool calls |
| Connectivity script | `scripts/nca-ping.ts` | One-shot health check; runs outside the agent for fast diagnostic |

## Boot order in `src/mastra/index.ts`

Same as base — no NCA-specific config at the Mastra root.

```typescript
// 1. Env validation FIRST
import { env } from '../lib/env';

// 2. AIMock provider switch
import { configureAIMock } from './lib/aimock';
configureAIMock();

// 3. Optional: NCA health check
import { ncaHealthcheck } from './lib/nca';
if (env.NCA_HEALTHCHECK_ON_BOOT) {
  await ncaHealthcheck(); // throws on failure → process exits
}

// 4. Mastra
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { PostgresStore } from '@mastra/pg';
import { DuckDBStore } from '@mastra/duckdb';
import { MastraCompositeStore } from '@mastra/core/storage';
import { Observability, DefaultExporter, SensitiveDataFilter } from '@mastra/observability';

import { mediaProcessorAgent } from './agents/_example';
import { toolCallAccuracyScorer, answerRelevancyScorer } from './scorers/_example.scorers';

export const mastra = new Mastra({
  agents: { mediaProcessor: mediaProcessorAgent },
  scorers: { toolCallAccuracyScorer, answerRelevancyScorer },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new PostgresStore({ id: 'mastra-storage', connectionString: env.SUPABASE_DB_URL }),
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    },
  }),
  logger: new PinoLogger({ name: 'Mastra', level: env.LOG_LEVEL }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [new DefaultExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});
```

The optional health check at boot uses top-level await (already supported per base's tsconfig).
