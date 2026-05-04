# NCA Polish 03 — Verify Reachability + Document

## Step 1: Verify all four endpoints

With `npm run dev` running. Pick the `mediaProcessor` agent for the verification examples — it's the canonical primary agent. The same patterns apply to the other six agents (just swap the agentId).

### REST endpoint
```bash
curl -X POST http://localhost:4111/api/agents/mediaProcessor/generate \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Run an NCA health check and tell me if the toolkit is reachable."}]}'
```

**Pass**: HTTP 200, agent calls `ncaTest`, response confirms NCA is reachable.

### A2A endpoints

The A2A protocol exposes two distinct endpoints per agent:

```bash
# Agent card (GET)
curl http://localhost:4111/api/.well-known/mediaProcessor/agent-card.json

# Send a message (POST, JSON-RPC)
curl -X POST http://localhost:4111/api/a2a/mediaProcessor \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":"1","method":"message/send","params":{"message":{"kind":"message","messageId":"msg-1","role":"user","parts":[{"kind":"text","text":"Run an NCA health check"}]}}}'
```

**Pass**: agent card returns 200 with JSON metadata; JSON-RPC call returns 200 with task result.

The path `/a2a/{agentId}` (without `/api/` prefix) returns Studio HTML — that's a Studio catch-all, not the A2A endpoint. Use the paths above.

### MCP endpoint

Initialize first:

```bash
curl -X POST http://localhost:4111/api/mcp/nca-mcp/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
```

**Pass**: HTTP 200, JSON-RPC response with server info `{"name":"template-mastra-nca","version":"0.1.0"}`. Note the URL uses `nca-mcp` (the MCPServer `id`), not `ncaMcp` (the mcpServers config key). The MCP protocol requires both the `Accept` header and an initial `initialize` call before `tools/list` will succeed.

After initialization, list tools:

```bash
curl -X POST http://localhost:4111/api/mcp/nca-mcp/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2}'
```

**Pass**: response lists all seven `ask_*` tools — `ask_mediaProcessor`, `ask_mediaSupervisor`, `ask_videoAgent`, `ask_audioAgent`, `ask_mediaAgent`, `ask_imageAgent`, `ask_toolkitAgent`.

If only `ask_mediaProcessor` appears (or fewer than 7), one or more agents weren't passed to the MCPServer constructor. Re-check Polish 02 Step 3.

### Studio + Editor + NCA regression check

- Studio loads
- All 7 agents visible in agent list
- Editor tab present on each agent
- Chat with `mediaProcessor`: ask "Run an NCA health check" — agent should call `ncaTest`, return success

If the NCA health check fails (token error, connection refused, etc.), the polish hasn't broken anything — but the underlying NCA Toolkit deployment may not be reachable from the dev environment. Verify with `npm run nca:ping`.

## Step 2: Document in README

Add a "Reachability" section after the Quickstart, matching the canonical pattern from `template-mastra-base/README.md`. Adapt for NCA — note that this template has 7 agents, all reachable through the same paths.

```markdown
## Reachability

Once the dev server is running (`npm run dev`), all seven agents in this template are reachable through four standard paths.

The agents are: `mediaProcessor`, `mediaSupervisor`, `videoAgent`, `audioAgent`, `mediaAgent`, `imageAgent`, `toolkitAgent`. Examples below use `mediaProcessor` — swap the agentId in the URL to address any of the others.

### REST API

\`\`\`bash
curl -X POST http://localhost:4111/api/agents/mediaProcessor/generate \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Run an NCA health check"}]}'
\`\`\`

For streaming responses, use `/stream` instead of `/generate`.

### A2A (Agent-to-Agent Protocol)

\`\`\`bash
# Get agent card
curl http://localhost:4111/api/.well-known/mediaProcessor/agent-card.json

# Send a message (JSON-RPC)
curl -X POST http://localhost:4111/api/a2a/mediaProcessor \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":"1","method":"message/send","params":{"message":{"kind":"message","messageId":"msg-1","role":"user","parts":[{"kind":"text","text":"Run an NCA health check"}]}}}'
\`\`\`

### MCP (Model Context Protocol)

Add to `claude_desktop_config.json`:

\`\`\`json
{
  "mcpServers": {
    "template-mastra-nca": {
      "url": "http://localhost:4111/api/mcp/nca-mcp/mcp"
    }
  }
}
\`\`\`

All seven agents appear as tools: `ask_mediaProcessor`, `ask_mediaSupervisor`, `ask_videoAgent`, `ask_audioAgent`, `ask_mediaAgent`, `ask_imageAgent`, `ask_toolkitAgent`. Note the URL uses the MCPServer `id` field (`nca-mcp`), not the config key in `src/mastra/index.ts` (`ncaMcp`).

### Studio (visual UI + Editor)

Open `http://localhost:4111`. Studio provides interactive chat, trace inspection, metrics, and the Agent Editor for non-developers to tune instructions without touching code.
```

## Step 3: Update AGENTS.md

Add a "Reachability conventions" section. Use the canonical text from `template-mastra-base/AGENTS.md` after its base polish. NCA-specific addition:

```markdown
## NCA template specifics

The `src/mastra/lib/nca.ts` file is the working HTTP client for the NCA Toolkit. Do not refactor without testing all five tool wrappers end-to-end. The client handles auth, retries, the Content-Type-only-on-POST rule, and the `/v1/toolkit/job/status` endpoint quirks (POST with body, not GET with path param).

This template has seven agents (mediaProcessor, mediaSupervisor, videoAgent, audioAgent, mediaAgent, imageAgent, toolkitAgent). All are registered with the MCPServer. When adding an eighth agent, register it in BOTH the `agents` field of the Mastra constructor AND the `agents` field of the MCPServer instance, and ensure it has a non-empty `description` property.

The async polling pattern (`getJobStatus` tool) is the canonical pattern for any NCA endpoint that returns a `job_id`. Reuse it in new tools rather than inventing a new pattern.
```

## What to capture in PROGRESS.md

```
## NCA Polish 03: Verify + Document Reachability
- Status: complete
- Endpoints verified:
  - REST: <pass | fail>
  - A2A card (/api/.well-known/mediaProcessor/agent-card.json): <pass | fail>
  - A2A execute (POST /api/a2a/mediaProcessor): <pass | fail>
  - MCP (/api/mcp/nca-mcp/mcp) — initialize: <pass | fail>
  - MCP tools/list shows all 7 ask_* tools: <pass | fail>
  - Studio + Editor: <pass | fail>
  - NCA regression check (mediaProcessor → ncaTest): <pass | fail>
- README updated with "Reachability" section
- AGENTS.md updated with conventions + NCA specifics
- Notes: <anything unexpected, especially around the NCA HTTP client or any agent that wouldn't register>
```

Move on to Polish 04.
