import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ncaRequest } from '../lib/nca';

export const getJobsStatus = createTool({
  id: 'getJobsStatus',
  description: 'Retrieve the status of all recent NCA jobs. Returns a map of job IDs to their current statuses.',
  inputSchema: z.object({
    sinceSeconds: z.number().optional(),
  }),
  outputSchema: z.object({
    jobs: z.record(z.string(), z.string()),
    message: z.string(),
  }),
  execute: async ({ sinceSeconds }) => {
    const body = {
      ...(sinceSeconds !== undefined && { since_seconds: sinceSeconds }),
    };

    const result = await ncaRequest<{
      code: number;
      job_id: string;
      response: Record<string, string>;
      message: string;
    }>('/v1/toolkit/jobs/status', Object.keys(body).length > 0 ? body : undefined);

    return {
      jobs: result.response ?? {},
      message: result.message,
    };
  },
});
