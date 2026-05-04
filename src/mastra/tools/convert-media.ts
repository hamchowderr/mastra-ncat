import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '../../lib/env';
import { ncaRequest } from '../lib/nca';

export const convertMedia = createTool({
  id: 'convertMedia',
  description: 'Convert a media file at a public URL to a different format (e.g. mp4, webm, mov, mp3, wav).',
  inputSchema: z.object({
    mediaUrl: z.string().url(),
    format: z.string(),
    webhookUrl: z.string().url().optional(),
    requestId: z.string().optional(),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.enum(['queued', 'completed']),
    resultUrl: z.string().url().optional(),
    message: z.string(),
  }),
  execute: async ({ mediaUrl, format, webhookUrl, requestId }) => {
    const body = {
      media_url: mediaUrl,
      format,
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
    }>('/v1/media/convert', body);

    const isCompleted = typeof result.response === 'string' && result.response.length > 0;

    return {
      jobId: result.job_id,
      status: isCompleted ? 'completed' as const : 'queued' as const,
      resultUrl: isCompleted ? result.response! : undefined,
      message: result.message,
    };
  },
});
