# NCA Polish — Standard Reachability + Editor Configuration

Brings the NCA template up to the family's standard configuration.

Every template in this family ships with REST, A2A, MCP, Studio, and the Editor. These are not optional. This polish brings `template-mastra-nca` to standard at `https://github.com/hamchowderr/template-mastra-nca`.

## NCA-specific notes

The NCA template grew during its initial build to include **seven agents** (mediaProcessor, mediaSupervisor, videoAgent, audioAgent, mediaAgent, imageAgent, toolkitAgent) instead of the single agent the original spec called for. **All seven** must be registered with the MCPServer so that MCP clients can address each one independently.

The `src/mastra/lib/nca.ts` HTTP client is critical infrastructure. Don't touch it. The polish work happens in `src/mastra/index.ts`, the agent files (only to add missing `description` fields), README, and AGENTS.md.

## Read these files in order

1. **`00-README.md`** (this file)
2. **`01-install-and-storage.md`** — install required packages, configure editor storage
3. **`02-register-editor-and-mcp.md`** — configure MCPServer (with all 7 agents) and MastraEditor
4. **`03-verify-and-document.md`** — verify all four endpoints, document
5. **`04-push-to-main.md`** — commit, push to main, watch CI

## Operating mode

- Stop after each polish step, write to `SPEC/PROGRESS.md`, wait for "continue".
- **No new git tag.** Main update only.
- **Don't refactor `src/mastra/lib/nca.ts`** — it's the working HTTP client.
- **Don't change agent behavior or instructions** — only add missing `description` fields if any are absent.
- Time budget: 60 minutes total.

## Reporting

After all 5 polish steps, write to `PROGRESS.md`:

```
## NCA Polish — Standard Reachability + Editor Configuration
- Status: complete | blocked
- All 5 polish steps: <list with pass/fail>
- Packages installed: @mastra/editor, @mastra/mcp
- Files changed: src/mastra/index.ts, README.md, AGENTS.md, package.json, agent files (descriptions only)
- nca.ts HTTP client: NOT MODIFIED (verified)
- Agent count: 7 — all registered with MCPServer
- CI run: <status>
- Notes: <anything unexpected>
```
