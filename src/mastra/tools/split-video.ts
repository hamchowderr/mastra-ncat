import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '../../lib/env';
import { ncaRequest } from '../lib/nca';

const splitSegment = z.object({ start: z.string(), end: z.string() });

export const splitVideo = createTool({
  id: 'splitVideo',
  description: 'Split a video at a public URL into multiple segments, each defined by a start/end time. Returns an array of output file URLs.',
  inputSchema: z.object({
    videoUrl: z.string().url(),
    splits: z.array(splitSegment).min(1),
    webhookUrl: z.string().url().optional(),
    requestId: z.string().optional(),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.enum(['queued', 'completed']),
    resultUrls: z.array(z.string().url()).optional(),
    message: z.string(),
  }),
  execute: async ({ videoUrl, splits, webhookUrl, requestId }) => {
    const body = {
      video_url: videoUrl,
      splits,
      ...(webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL
        ? { webhook_url: webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL }
        : {}),
      ...(requestId && { id: requestId }),
    };

    const result = await ncaRequest<{
      code: number;
      job_id: string;
      response: Array<{ file_url: string }> | null;
      message: string;
    }>('/v1/video/split', body);

    const isCompleted = Array.isArray(result.response) && result.response.length > 0;

    return {
      jobId: result.job_id,
      status: isCompleted ? 'completed' as const : 'queued' as const,
      resultUrls: isCompleted ? result.response!.map(r => r.file_url) : undefined,
      message: result.message,
    };
  },
});
