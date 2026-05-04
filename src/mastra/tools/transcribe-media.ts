import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '../../lib/env';
import { ncaRequest } from '../lib/nca';

export const transcribeMedia = createTool({
  id: 'transcribeMedia',
  description:
    'Transcribe audio or video to text. Source must be at a publicly-accessible URL. Returns transcript or job_id.',
  inputSchema: z.object({
    mediaUrl: z.string().url().describe('Public URL of the source audio or video'),
    language: z.string().optional().describe('Optional language hint (ISO code, e.g., "en", "es")'),
    webhookUrl: z.string().url().optional(),
    requestId: z.string().optional(),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.enum(['queued', 'completed']),
    transcript: z.string().optional(),
    message: z.string(),
  }),
  execute: async ({ mediaUrl, language, webhookUrl, requestId }) => {
    const resolvedWebhook = webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL;

    const body = {
      media_url: mediaUrl,
      ...(language && { language }),
      ...(resolvedWebhook ? { webhook_url: resolvedWebhook } : {}),
      ...(requestId && { id: requestId }),
    };

    const result = await ncaRequest<{
      code: number;
      job_id: string;
      response: string | null;
      message: string;
    }>('/v1/media/transcribe', body);

    const isCompleted = typeof result.response === 'string' && result.response.length > 0;

    return {
      jobId: result.job_id,
      status: (isCompleted ? 'completed' : 'queued') as 'completed' | 'queued',
      transcript: isCompleted ? result.response! : undefined,
      message: result.message,
    };
  },
});
