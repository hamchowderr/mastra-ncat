import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '../../lib/env';
import { ncaRequest } from '../lib/nca';

export const imageToVideo = createTool({
  id: 'imageToVideo',
  description: 'Convert a static image at a public URL into a video with a Ken Burns (zoom) effect.',
  inputSchema: z.object({
    imageUrl: z.string().url(),
    length: z.number().min(1).max(60).optional(),
    frameRate: z.number().min(15).max(60).optional(),
    zoomSpeed: z.number().min(0).max(100).optional(),
    webhookUrl: z.string().url().optional(),
    requestId: z.string().optional(),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.enum(['queued', 'completed']),
    resultUrl: z.string().url().optional(),
    message: z.string(),
  }),
  execute: async ({ imageUrl, length, frameRate, zoomSpeed, webhookUrl, requestId }) => {
    const body = {
      image_url: imageUrl,
      ...(length !== undefined && { length }),
      ...(frameRate !== undefined && { frame_rate: frameRate }),
      ...(zoomSpeed !== undefined && { zoom_speed: zoomSpeed }),
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
    }>('/v1/image/convert/video', body);

    const isCompleted = typeof result.response === 'string' && result.response.length > 0;

    return {
      jobId: result.job_id,
      status: isCompleted ? 'completed' as const : 'queued' as const,
      resultUrl: isCompleted ? result.response! : undefined,
      message: result.message,
    };
  },
});
