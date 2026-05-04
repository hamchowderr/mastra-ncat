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
│       │   └── _example.ts               # REPLACED — media processor agent
│       ├── index.ts                      # Inherited; agent registration updated
│       ├── lib/
│       │   ├── aimock.ts                 # From base, unchanged
│       │   ├── nca.ts                    # NEW — typed HTTP client for NCA Toolkit
│       │   └── supabase.ts               # From base, unchanged
│       ├── scorers/
│       │   ├── _example.scorers.ts       # REPLACED — tool-call accuracy + answer relevancy
│       │   └── datasets/
│       │       └── _example.json         # REPLACED — NCA agent eval dataset
│       ├── tools/
│       │   ├── nca-test.ts               # NEW — health check
│       │   ├── caption-video.ts          # NEW — /v1/video/caption
│       │   ├── transcribe-media.ts       # NEW — /v1/media/transcribe
│       │   ├── ffmpeg-compose.ts         # NEW — /v1/ffmpeg/compose
│       │   └── get-job-status.ts         # NEW — /v1/toolkit/job/status
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
| HTTP client | `src/mastra/lib/nca.ts` | Single function: `ncaRequest<T>(path, body, opts)`. Handles auth, retries, timeout, type safety. |
| `nca-test` tool | `src/mastra/tools/nca-test.ts` | GET `/v1/toolkit/test` — proves NCA is reachable, API key valid, S3 working |
| `caption-video` tool | `src/mastra/tools/caption-video.ts` | POST `/v1/video/caption` — adds captions to a video URL |
| `transcribe-media` tool | `src/mastra/tools/transcribe-media.ts` | POST `/v1/media/transcribe` — speech-to-text on audio/video URL |
| `ffmpeg-compose` tool | `src/mastra/tools/ffmpeg-compose.ts` | POST `/v1/ffmpeg/compose` — arbitrary ffmpeg composition from URLs |
| `get-job-status` tool | `src/mastra/tools/get-job-status.ts` | POST `/v1/toolkit/job/status` with `{ job_id }` in body — poll a previously-started job |
| Media processor agent | `src/mastra/agents/_example.ts` | Production agent. Uses all 5 tools. Demonstrates polling pattern in instructions. |
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
