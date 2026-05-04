# Prompt: Wrap a New NCA Toolkit Endpoint

Use this prompt to add a new tool that wraps an NCA Toolkit API endpoint. The result is a type-safe Mastra tool that follows all project conventions.

---

## Inputs (fill these in before using the prompt)

```
ENDPOINT_PATH:     <NCA path, e.g. "/v1/video/trim">
HTTP_METHOD:       <GET or POST>
TOOL_ID:           <camelCase tool id, e.g. "trimVideo">
TOOL_FILE:         <kebab-case filename, e.g. "trim-video.ts">
PURPOSE:           <one sentence: what this endpoint does>
REQUEST_BODY:      <describe the fields: name, type, required?, description>
RESPONSE_BODY:     <describe the fields: code, job_id, response, message>
IS_ASYNC:          <yes = returns job_id + status:"queued"; no = returns result directly>
RESULT_FIELD:      <if async: what field holds the result URL/text when complete, e.g. "response">
```

---

## Prompt

You are adding a new NCA Toolkit tool to the `template-mastra-nca` Mastra project. Follow every convention in `AGENTS.md` exactly.

**Tool to build**: `{TOOL_ID}` in `src/mastra/tools/{TOOL_FILE}`

**NCA endpoint**: `{HTTP_METHOD} {ENDPOINT_PATH}`

**Purpose**: {PURPOSE}

---

### Before writing code

1. Run this curl against your local NCA to verify the exact request/response shape:
   ```bash
   curl -X {HTTP_METHOD} "$NCA_BASE_URL{ENDPOINT_PATH}" \
     -H "x-api-key: $NCA_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{<minimal valid request body>}'
   ```
2. Confirm the response contains `job_id` and `message` fields (NCA standard)
3. For async ops: run a probe job and poll `/v1/toolkit/job/status` to see the completed shape

---

### Deliverable: `src/mastra/tools/{TOOL_FILE}`

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '../../lib/env';       // only if using NCA_DEFAULT_WEBHOOK_URL
import { ncaRequest, NcaError } from '../lib/nca';   // NcaError only if you need to catch specific status codes

export const {TOOL_ID} = createTool({
  id: '{TOOL_ID}',
  description: '<clear one-sentence description of what this tool does>',
  inputSchema: z.object({
    // Required fields from {REQUEST_BODY}
    // Optional fields last
    webhookUrl: z.string().url().optional(),
    requestId: z.string().optional(),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    // For async ({IS_ASYNC} = yes):
    status: z.enum(['queued', 'completed']),
    // Add result field if relevant (e.g. resultUrl, transcript, etc.)
    message: z.string(),
  }),
  execute: async ({ param1, param2, webhookUrl, requestId }) => {
    // Build body — only include optional fields if present
    const body = {
      field_name: param1,
      ...(param2 && { other_field: param2 }),
      ...(webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL
        ? { webhook_url: webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL }
        : {}),
      ...(requestId && { id: requestId }),
    };

    const result = await ncaRequest<{
      code: number;
      job_id: string;
      response: <type> | null;
      message: string;
    }>('{ENDPOINT_PATH}', body);

    // For async ops: detect completion by checking result.response
    const isCompleted = /* check result.response is non-null/non-empty */;

    return {
      jobId: result.job_id,
      status: isCompleted ? 'completed' as const : 'queued' as const,
      // resultField: isCompleted ? result.response! : undefined,
      message: result.message,
    };
  },
});
```

**Critical rules**:
- Never call `fetch` directly — always use `ncaRequest`
- `execute` receives input directly as first arg: `async ({ param1, ... })` — NOT `async ({ context })`
- Cast status ternary to `as const` — ternary widens to `string` without it
- Only include `Content-Type` header by sending a body (handled automatically by `ncaRequest`)
- If NCA returns 404 for a specific case (e.g. unknown ID), catch `NcaError` with `.status === 404` and return a meaningful result — do NOT let it throw to the agent

---

### After writing the file

1. Run `npm run typecheck` — must pass with zero errors
2. Register the tool in `src/mastra/agents/_example.ts` under `tools:`
3. Add at least one eval case to `src/mastra/scorers/datasets/_example.json`:
   ```json
   {
     "name": "calls {TOOL_ID}",
     "input": "<user message that should trigger this tool>",
     "expectedTool": "{TOOL_ID}",
     "expectedKeywords": []
   }
   ```
4. Re-run `npm run eval` — must still exit 0
