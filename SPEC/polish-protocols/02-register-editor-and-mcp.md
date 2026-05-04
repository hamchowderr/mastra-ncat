# NCA Polish 02 — Configure MCPServer + MastraEditor

## Step 1: Verify every agent has a description

NCA has seven agents that all need to be exposed via MCP. Every one must have a non-empty `description` property — MCPServer registration throws at boot if any are missing.

Check each of these files:
- `src/mastra/agents/_example.ts` — mediaProcessorAgent
- `src/mastra/agents/media-supervisor.ts` — mediaSupervisorAgent
- `src/mastra/agents/video-agent.ts` — videoAgent
- `src/mastra/agents/audio-agent.ts` — audioAgent
- `src/mastra/agents/media-agent.ts` — mediaAgent
- `src/mastra/agents/image-agent.ts` — imageAgent
- `src/mastra/agents/toolkit-agent.ts` — toolkitAgent

For any agent missing a `description` field, add one. Suggested defaults:

| Agent | Suggested description |
|---|---|
| mediaProcessorAgent | `'General-purpose NCA media processor. Routes media tasks across NCA Toolkit endpoints (transcription, captioning, ffmpeg compose, job polling). Reference implementation for the family.'` |
| mediaSupervisorAgent | `'Coordinates multi-step NCA workflows by delegating to specialist agents (video, audio, media, image, toolkit). Use for complex media pipelines that span multiple endpoint categories.'` |
| videoAgent | `'Specialist for NCA video operations: caption generation, video composition via ffmpeg, and other video-only endpoints.'` |
| audioAgent | `'Specialist for NCA audio operations: transcription, audio composition, and other audio-only endpoints.'` |
| mediaAgent | `'Specialist for NCA media operations that apply to either audio or video, including transcription and metadata extraction.'` |
| imageAgent | `'Specialist for NCA image operations: thumbnails, frames, and image-only transformations.'` |
| toolkitAgent | `'Specialist for NCA toolkit operations: connectivity tests, authentication, and job status polling.'` |

If an agent already has a description, keep it. Note the existing text in PROGRESS.md.

If you decide to write your own description text instead of using the suggested default, that's fine — just make sure it accurately reflects what the agent does in NCA's current implementation.

## Step 2: Imports

At the top of `src/mastra/index.ts`, add:

```typescript
import { MastraEditor } from '@mastra/editor';
import { MCPServer } from '@mastra/mcp';
```

## Step 3: Construct the MCPServer with all 7 agents

Before the `Mastra` constructor block:

```typescript
const mcpServer = new MCPServer({
  id: 'nca-mcp',
  name: 'template-mastra-nca',
  version: '0.1.0',
  description: 'MCP server exposing template-mastra-nca agents (NCA Toolkit media processing) as tools',
  tools: {},
  agents: {
    mediaProcessor: mediaProcessorAgent,
    mediaSupervisor: mediaSupervisorAgent,
    videoAgent,
    audioAgent,
    mediaAgent,
    imageAgent,
    toolkitAgent,
  },
});
```

**Important — `tools: {}` is required.** The `MCPServerConfig` type marks `tools: ToolsInput` as a required field, even when registering agents-only. Pass an empty object. Omitting it will fail typecheck.

**Important — the URL uses the `id`, not the config key.** When the server is registered as `mcpServers: { ncaMcp: mcpServer }` below, the resulting MCP endpoint is `/api/mcp/nca-mcp/mcp` (using the `id` from the constructor), NOT `/api/mcp/ncaMcp/mcp` (the config key). Use the `id` in cURL examples and client config.

**Important — register all 7 agents.** This is the family's reachability standard: every agent in the template's `agents` field must also be in the MCPServer's `agents` field. Each agent appears in MCP as a tool named `ask_<agentId>` — for NCA that means `ask_mediaProcessor`, `ask_mediaSupervisor`, `ask_videoAgent`, `ask_audioAgent`, `ask_mediaAgent`, `ask_imageAgent`, and `ask_toolkitAgent`.

## Step 4: Configure the Mastra constructor

NCA currently has:

```typescript
export const mastra = new Mastra({
  agents: {
    mediaProcessor: mediaProcessorAgent,
    mediaSupervisor: mediaSupervisorAgent,
    videoAgent,
    audioAgent,
    mediaAgent,
    imageAgent,
    toolkitAgent,
  },
  scorers: { answerRelevancyScorer },
  storage: new MastraCompositeStore({ ... }),  // editor configured in Polish 01
  logger: new PinoLogger({ ... }),
  observability: new Observability({ ... }),
});
```

Required state:

```typescript
export const mastra = new Mastra({
  agents: {
    mediaProcessor: mediaProcessorAgent,
    mediaSupervisor: mediaSupervisorAgent,
    videoAgent,
    audioAgent,
    mediaAgent,
    imageAgent,
    toolkitAgent,
  },
  scorers: { answerRelevancyScorer },
  mcpServers: { ncaMcp: mcpServer },
  storage: new MastraCompositeStore({ ... }),
  logger: new PinoLogger({ ... }),
  observability: new Observability({ ... }),
  editor: new MastraEditor(),
});
```

## Step 5: Verify typecheck and dev boot

```bash
npm run typecheck
npm run dev
```

**Pass**:
- Typecheck zero errors
- Studio loads (port 4111 if available, else next port — that's fine)
- All 7 agents visible in agent list
- Editor tab present on each agent
- No console errors

If MCPServer registration throws at boot with a message about a missing description, the description was missed for one of the agents in Step 1. Re-check.

## What to capture in PROGRESS.md

```
## NCA Polish 02: Configure MCPServer + MastraEditor
- Status: complete
- Agent descriptions:
  - mediaProcessor: <existing | added: ...>
  - mediaSupervisor: <existing | added: ...>
  - videoAgent: <existing | added: ...>
  - audioAgent: <existing | added: ...>
  - mediaAgent: <existing | added: ...>
  - imageAgent: <existing | added: ...>
  - toolkitAgent: <existing | added: ...>
- Imports added: MastraEditor, MCPServer
- Configuration: MCPServer instance (id: nca-mcp, tools: {}, all 7 agents) + mcpServers and editor in Mastra constructor
- nca.ts HTTP client untouched: confirmed
- Verification: typecheck passes; dev boots; all 7 agents visible; Editor tab visible on each
- Notes: <anything unexpected>
```

Move on to Polish 03.
