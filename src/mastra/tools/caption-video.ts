import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '../../lib/env';
import { ncaRequest } from '../lib/nca';

export const captionVideo = createTool({
  id: 'captionVideo',
  description:
    'Add captions to a video. Source video must be at a publicly-accessible URL. Returns a job_id for polling, or a result URL if synchronous.',
  inputSchema: z.object({
    videoUrl: z.string().url().describe('Public URL of the source video'),
    captions: z.string().describe('SRT-formatted caption text, OR a URL to an SRT file'),
    settings: z
      .object({
        font_size: z.number().int().positive().optional(),
        font_color: z.string().optional().describe('Hex or named color, e.g., #ffffff or white'),
        position: z.enum(['top', 'middle', 'bottom']).optional(),
      })
      .optional(),
    webhookUrl: z.string().url().optional(),
    requestId: z.string().optional(),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.enum(['queued', 'completed']),
    resultUrl: z.string().url().optional(),
    message: z.string(),
  }),
  execute: async ({ videoUrl, captions, settings, webhookUrl, requestId }) => {
    const resolvedWebhook = webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL;

    const body = {
      video_url: videoUrl,
      captions,
      ...(settings && { settings }),
      ...(resolvedWebhook ? { webhook_url: resolvedWebhook } : {}),
      ...(requestId && { id: requestId }),
    };

    const result = await ncaRequest<{
      code: number;
      job_id: string;
      response: string | null;
      message: string;
    }>('/v1/video/caption', body);

    const isCompleted = typeof result.response === 'string' && result.response.startsWith('http');

    return {
      jobId: result.job_id,
      status: (isCompleted ? 'completed' : 'queued') as 'completed' | 'queued',
      resultUrl: isCompleted ? result.response! : undefined,
      message: result.message,
    };
  },
});
