import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '../../lib/env';
import { ncaRequest } from '../lib/nca';

export const detectSilence = createTool({
  id: 'detectSilence',
  description: 'Detect silent intervals in a public media file. Returns an array of silence segments with start/end times in seconds.',
  inputSchema: z.object({
    mediaUrl: z.string().url(),
    duration: z.number().positive(),
    start: z.string().optional(),
    end: z.string().optional(),
    noise: z.string().optional(),
    mono: z.boolean().optional(),
    webhookUrl: z.string().url().optional(),
    requestId: z.string().optional(),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.enum(['queued', 'completed']),
    silenceIntervals: z.array(z.object({ start: z.number(), end: z.number() })).optional(),
    message: z.string(),
  }),
  execute: async ({ mediaUrl, duration, start, end, noise, mono, webhookUrl, requestId }) => {
    const body = {
      media_url: mediaUrl,
      duration,
      ...(start && { start }),
      ...(end && { end }),
      ...(noise && { noise }),
      ...(mono !== undefined && { mono }),
      ...(webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL
        ? { webhook_url: webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL }
        : {}),
      ...(requestId && { id: requestId }),
    };

    const result = await ncaRequest<{
      code: number;
      job_id: string;
      response: Array<{ start: number; end: number }> | null;
      message: string;
    }>('/v1/media/silence', body);

    const isCompleted = Array.isArray(result.response);

    return {
      jobId: result.job_id,
      status: isCompleted ? 'completed' as const : 'queued' as const,
      silenceIntervals: isCompleted ? result.response! : undefined,
      message: result.message,
    };
  },
});
