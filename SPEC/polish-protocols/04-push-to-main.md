# NCA Polish 04 — Push to Main

## Step 1: Pre-flight

```bash
cd C:\Users\HamCh\code\template-mastra-nca
git status
```

Verify nothing sensitive is staged.

## Step 2: Commit

```bash
git add .
git commit -m "Configure standard reachability stack

Brings template up to family standard:
- @mastra/editor: non-developer agent iteration via Studio Editor
- @mastra/mcp: MCPServer exposing all 7 agents (mediaProcessor, mediaSupervisor, video/audio/media/image/toolkit)
- editor storage as top-level field on MastraCompositeStore
- README documents REST/A2A/MCP/Studio reachability for all 7 agents
- AGENTS.md documents reachability conventions and NCA specifics
- nca.ts HTTP client unchanged"
```

## Step 3: Push to main

```bash
git push origin main
```

**No tag.** Owner explicit decision.

## Step 4: Watch CI

```bash
& 'C:\Program Files\GitHub CLI\gh.exe' run watch --repo hamchowderr/template-mastra-nca
```

**Pass criteria**: All four CI jobs green: typecheck, build, eval, docker.

NCA-specific failures to watch for:

| Failure | Likely cause | Fix |
|---|---|---|
| `build` red, "agent has no description" | An agent didn't get a description in Polish 02 | Re-check all 7 agent files |
| `build` red, MCPServer type error | `tools: {}` was omitted from MCPServer constructor | Re-check Polish 02 Step 3 |
| `build` red, `editor` not assignable | `editor` was put inside `domains` instead of top-level | Re-check Polish 01 |
| `eval` red | Highly unlikely — polish doesn't change agent behavior. Investigate if it happens. | Look at trace; may be unrelated flake |
| `docker` red | Unlikely — Dockerfile unchanged | Look at logs |

If something fails that isn't on this list, write to PROGRESS.md and stop. Don't push band-aid fixes.

## Step 5: Final wrap-up entry in PROGRESS.md

```markdown
## NCA Polish — Standard Reachability + Editor Configuration — COMPLETE

- Status: complete
- All 4 polish steps:
  - 01 Install Packages + Editor Storage: pass
  - 02 Configure MCPServer + MastraEditor: pass
  - 03 Verify + Document Reachability: pass
  - 04 Push to Main: pass
- Repo: https://github.com/hamchowderr/template-mastra-nca
- CI: green on main
- Packages installed: @mastra/editor, @mastra/mcp
- Files changed: package.json, package-lock.json, src/mastra/index.ts, README.md, AGENTS.md, src/mastra/agents/*.ts (descriptions only)
- nca.ts HTTP client: NOT MODIFIED (verified)
- All 7 agents registered with MCPServer
- All 7 ask_* tools verified in MCP tools/list response
- No new tag pushed
- Recommended next action: chat template (next branch in family roadmap)
```

Done. All five templates in the family — base, voice, RAG, NCA, and Descript — now have the standard reachability stack: REST + A2A + MCP + Studio + Editor.
