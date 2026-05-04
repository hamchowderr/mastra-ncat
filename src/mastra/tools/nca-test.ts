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
