import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ncaRequest, NcaError } from '../lib/nca';

export const getJobStatus = createTool({
  id: 'getJobStatus',
  description:
    'Check the status of a previously-started NCA job. Use this after captionVideo, transcribeMedia, or ffmpegCompose return status="queued".',
  inputSchema: z.object({
    jobId: z.string().describe('The job_id returned from a previous NCA tool call'),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.enum(['queued', 'running', 'completed', 'failed']),
    response: z.unknown().optional().describe('The result payload (URL or transcript) once complete'),
    error: z.string().optional(),
    message: z.string(),
  }),
  execute: async ({ jobId }) => {

    try {
      // POST with job_id in request body — NCA's documented shape (verified Phase 4)
      const result = await ncaRequest<{
        code: number;
        job_id: string;
        status?: string;
        response?: unknown;
        message: string;
      }>('/v1/toolkit/job/status', { job_id: jobId });

      const status =
        (result.status as 'queued' | 'running' | 'completed' | 'failed' | undefined) ??
        (result.code === 200 && result.response ? 'completed' : 'queued');

      return {
        jobId: result.job_id,
        status,
        response: result.response,
        error: status === 'failed' ? result.message : undefined,
        message: result.message,
      };
    } catch (err) {
      // NCA returns HTTP 404 when a job ID is not found (verified Phase 4 probe)
      if (err instanceof NcaError && err.status === 404) {
        return {
          jobId,
          status: 'failed' as const,
          error: `Job not found: ${jobId}`,
          message: `Job not found: ${jobId}`,
        };
      }
      throw err;
    }
  },
});
