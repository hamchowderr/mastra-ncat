import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '../../lib/env';
import { ncaRequest } from '../lib/nca';

export const mediaMetadata = createTool({
  id: 'mediaMetadata',
  description: 'Retrieve technical metadata (duration, codec, resolution, bitrate, format) from a public media file URL.',
  inputSchema: z.object({
    mediaUrl: z.string().url(),
    webhookUrl: z.string().url().optional(),
    requestId: z.string().optional(),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.enum(['queued', 'completed']),
    metadata: z.record(z.string(), z.any()).optional(),
    message: z.string(),
  }),
  execute: async ({ mediaUrl, webhookUrl, requestId }) => {
    const body = {
      media_url: mediaUrl,
      ...(webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL
        ? { webhook_url: webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL }
        : {}),
      ...(requestId && { id: requestId }),
    };

    const result = await ncaRequest<{
      code: number;
      job_id: string;
      response: Record<string, unknown> | null;
      message: string;
    }>('/v1/media/metadata', body);

    const isCompleted = result.response != null && typeof result.response === 'object';

    return {
      jobId: result.job_id,
      status: isCompleted ? 'completed' as const : 'queued' as const,
      metadata: isCompleted ? result.response! : undefined,
      message: result.message,
    };
  },
});
