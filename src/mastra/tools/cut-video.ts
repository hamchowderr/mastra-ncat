import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '../../lib/env';
import { ncaRequest } from '../lib/nca';

const cutSegment = z.object({ start: z.string(), end: z.string() });

export const cutVideo = createTool({
  id: 'cutVideo',
  description: 'Remove specific time segments from a video at a public URL, keeping everything outside the cuts.',
  inputSchema: z.object({
    videoUrl: z.string().url(),
    cuts: z.array(cutSegment).min(1),
    webhookUrl: z.string().url().optional(),
    requestId: z.string().optional(),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.enum(['queued', 'completed']),
    resultUrl: z.string().url().optional(),
    message: z.string(),
  }),
  execute: async ({ videoUrl, cuts, webhookUrl, requestId }) => {
    const body = {
      video_url: videoUrl,
      cuts,
      ...(webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL
        ? { webhook_url: webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL }
        : {}),
      ...(requestId && { id: requestId }),
    };

    const result = await ncaRequest<{
      code: number;
      job_id: string;
      response: string | null;
      message: string;
    }>('/v1/video/cut', body);

    const isCompleted = typeof result.response === 'string' && result.response.length > 0;

    return {
      jobId: result.job_id,
      status: isCompleted ? 'completed' as const : 'queued' as const,
      resultUrl: isCompleted ? result.response! : undefined,
      message: result.message,
    };
  },
});
