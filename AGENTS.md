# AGENTS.md — Conventions for AI Coding Agents

This file is for AI coding agents (Claude Code, Cursor, Copilot, etc.) working on this codebase. It describes conventions, rules, and things to never do.

---

## Boot Order (critical)

`src/mastra/index.ts` must initialize in this exact order:

```
1. env validation         (import env from '../lib/env')
2. AIMock setup           (configureAIMock())
3. Optional NCA health    (await ncaHealthcheck() if NCA_HEALTHCHECK_ON_BOOT)
4. Mastra instance        (new Mastra({ ... }))
```

**Why**: The Vercel AI SDK reads provider base URLs at client instantiation. AIMock must overwrite env vars before any AI SDK client is constructed. Env must validate before AIMock so it can read `USE_AIMOCK` and `AIMOCK_URL`. NCA health check runs after AIMock so it uses the real NCA URL even in mock mode (NCA is not mocked — only LLM calls are).

Never reorder these. Never construct an `Agent` or `@ai-sdk/*` client before `configureAIMock()` is called.

---

## Import Rules

- Use **relative imports** for everything inside `src/mastra/`
- `src/lib/env` is the only cross-boundary import allowed in `src/mastra/`
- Never import from `src/mastra/` in `src/lib/`
- Never use barrel/index files — import from the specific file

```typescript
// correct
import { env } from '../../lib/env';
import { ncaRequest } from '../lib/nca';

// wrong
import { env } from '@/lib/env';       // no path aliases
import { ncaRequest } from '../lib';   // no barrel imports
```

---

## NCA Conventions

**Never call `fetch` directly to NCA endpoints.** All NCA HTTP calls must go through `ncaRequest` from `src/mastra/lib/nca.ts`. This ensures:
- Auth header (`x-api-key`) is applied consistently
- `Content-Type` is only sent when a body is present (NCA returns 400 on GET with Content-Type)
- Timeout and retry logic is applied
- Errors are shaped as `NcaError` with `status`, `body`, and `path`

**Tools take URLs, not file uploads.** NCA fetches source media from publicly-accessible URLs. If a user provides a local file path, the agent must refuse and ask for a URL.

**Async job pattern**: Long operations return `{ job_id, status: "queued" }`. The tool returns this to the agent, and the agent polls `getJobStatus` with ~3s delay, up to 30 polls. Never bake polling into a tool itself — that blocks the agent's reasoning loop.

**NCA returns HTTP 404 for unknown job IDs** (not a 200 with error body). `get-job-status.ts` catches `NcaError(404)` and returns `status: "failed"`. Other tools should NOT catch 404 — only job status has this edge case.

**NCA returns 5xx during heavy processing** — `ncaRequest` retries these automatically up to `NCA_RETRIES` times with exponential backoff. 4xx errors are never retried.

---

## Environment Variables

All env vars flow through `src/lib/env.ts`. This is the single source of truth.

Rules:
- Never read `process.env.*` directly outside of `src/lib/env.ts`
- When adding a new env var: add to the Zod schema in `env.ts` AND to `.env.example` at the same time
- Optional vars use `.optional()` in the schema; required vars have no default
- Boolish vars use the `boolish` transform defined at the top of `env.ts` — do NOT use `.default('false')` (string not assignable to boolean after transform)

---

## Agent Conventions

File naming: `src/mastra/agents/<kebab-name>.ts` (prefix `_` for examples/templates).

Every agent file must export:
1. The agent instance with `id`, `name`, `instructions`, `model`, and `scorers`

Model string format: `anthropic/claude-haiku-4-5` (provider/model-id).

Scorers:
- `answerRelevancyScorer` is the only module-level scorer singleton (re-exported from `_example.scorers.ts`)
- Under AIMock (`USE_AIMOCK=true`), set `answerRelevancy` sampling rate to 0 — LLM-judged scorers can't be mocked usefully

Tools used only by one agent can live in the agent file or in `src/mastra/tools/`. Shared tools always go in `src/mastra/tools/`.

---

## Scorer Conventions

File naming: `src/mastra/scorers/<agent-name>.scorers.ts`.
Dataset files: `src/mastra/scorers/datasets/<agent-name>.json`.

Dataset schema:
```json
{
  "agentId": "videoAgent",
  "thresholds": { "answerRelevancy": 0.5 },
  "cases": [
    {
      "name": "descriptive test name",
      "input": "user message",
      "expectedTool": "toolName",     // or null if no tool should be called
      "expectedKeywords": ["word"]    // must appear in response text
    }
  ]
}
```

Minimum 2 cases per domain agent: at least 1 positive tool call + 1 negative (refuses invalid input).

**AIMock fixture format** for tool-call cases (two-turn):
```json
{ "match": { "userMessage": "...", "hasToolResult": false }, "response": { "toolCalls": [{ "name": "toolName", "arguments": { "url": "..." } }] } }
{ "match": { "userMessage": "...", "hasToolResult": true  }, "response": { "content": "Done. Result at https://..." } }
```

For refusal cases (`expectedTool: null`), single-turn is sufficient:
```json
{ "match": { "userMessage": "..." }, "response": { "content": "I can't process local file paths..." } }
```

Each domain has its own fixture file in `fixtures/<domain>-agent.json`. Messages must be unique across all fixture files — AIMock loads the entire `fixtures/` directory and matches globally.

`answerRelevancy` threshold is 0.5 (not 0.7) — LLM-judged relevancy scores technical tool outputs and refusals poorly even when behavior is correct.

---

## Storage

The Mastra instance uses a composite store:
- **default domain** → `PostgresStore` (Supabase Postgres via `SUPABASE_DB_URL`)
- **observability domain** → `DuckDBStore`

Both require an explicit `id` field. `DuckDBStore` requires glibc — never run in Alpine.

---

## Adding a New NCA Tool

1. Read the NCA endpoint docs at `https://github.com/stephengpope/no-code-architects-toolkit/tree/main/docs`
2. Verify the endpoint shape with `curl` against your local NCA before writing code
3. Import `ncaRequest` (and `NcaError` if needed) from `../lib/nca`
4. Output schema: return `jobId` + `status: "queued" | "completed"` for async ops; add `resultUrl`/`transcript`/etc. for completed
5. Add `execute: async ({ param1, param2 }) => { ... }` — Mastra passes input directly as first arg, NOT `{ context }`
6. Cast status ternaries: `isCompleted ? 'completed' as const : 'queued' as const` — ternary widens to `string` otherwise
7. Register in the agent's `tools:` map and add eval cases

---

## Things to Never Do

- **Never read `process.env` directly** — use `env` from `src/lib/env.ts`
- **Never call `fetch` directly to NCA** — use `ncaRequest` from `src/mastra/lib/nca.ts`
- **Never send Content-Type on GET requests** — NCA returns 400; `ncaRequest` handles this automatically
- **Never construct an AI SDK client before `configureAIMock()`** — AIMock will be bypassed silently
- **Never set `ANTHROPIC_BASE_URL = AIMOCK_URL` bare** — `@ai-sdk/anthropic` appends `/messages`, so set it to `${AIMOCK_URL}/v1` to land at `/v1/messages`
- **Never change the Dockerfile base to `node:22-alpine`** — DuckDB SIGSEGV on musl
- **Never add a new env var without updating `.env.example`**
- **Never skip the Zod schema for a new env var** — process starts with undefined silently
- **Never use `execute: async ({ context }) =>`** — Mastra passes input directly as first arg: `execute: async ({ mediaUrl, ... }) =>`
- **Never import from `src/mastra/` in `src/lib/`** — circular dependency risk
- **Never use barrel/index imports**

---

## Ask Before Acting

Stop and confirm before making these changes:

- Changing the boot order in `src/mastra/index.ts`
- Adding `NCA_HEALTHCHECK_ON_BOOT=true` to any environment (will fail if NCA unreachable)
- Removing or renaming a scorer referenced in a dataset JSON
- Downgrading a Mastra package version
- Adding a new `domain` to the composite store
- Any Supabase schema migrations

---

## Useful Commands

```bash
npm run dev          # Start Studio at localhost:4111
npm run typecheck    # Verify types before running
npm run nca:ping     # Verify NCA is reachable (run before eval or after config change)
npm run eval:all     # Run all 7 eval datasets; exits 0 on pass, 1 on fail
npx supabase start   # Start local Supabase (Docker required)
```

Live evals (`USE_AIMOCK=false`) hit the real Anthropic API and call real NCA endpoints. Use AIMock for free deterministic runs during development.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
