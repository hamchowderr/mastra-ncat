import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '../../lib/env';
import { ncaRequest } from '../lib/nca';

const cutSegment = z.object({ start: z.string(), end: z.string() });

export const cutMedia = createTool({
  id: 'cutMedia',
  description: 'Remove specific time segments from a media file (audio or video) at a public URL, keeping everything outside the cuts.',
  inputSchema: z.object({
    mediaUrl: z.string().url(),
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
  execute: async ({ mediaUrl, cuts, webhookUrl, requestId }) => {
    const body = {
      media_url: mediaUrl,
      cuts,
      ...(webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL
        ? { webhook_url: webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL }
        : {}),
      ...(requestId && { id: requestId }),
    };

    const result = await ncaRequest<{
      code: number;
      job_id: string;
      response: { file_url: string } | null;
      message: string;
    }>('/v1/media/cut', body);

    const isCompleted = result.response != null && typeof result.response === 'object';

    return {
      jobId: result.job_id,
      status: isCompleted ? 'completed' as const : 'queued' as const,
      resultUrl: isCompleted ? result.response!.file_url : undefined,
      message: result.message,
    };
  },
});
