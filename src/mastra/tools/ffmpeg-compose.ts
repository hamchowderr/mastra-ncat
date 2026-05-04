import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '../../lib/env';
import { ncaRequest } from '../lib/nca';

const inputSchema = z.object({
  inputs: z
    .array(z.object({ url: z.string().url() }))
    .min(1, 'At least one input required'),
  filters: z.array(z.object({ filter: z.string() })).optional(),
  outputs: z
    .array(
      z.object({
        options: z
          .array(
            z.object({
              option: z.string().describe('ffmpeg option flag (e.g., "-c:v")'),
              argument: z.string().describe('Value (e.g., "libx264")'),
            }),
          )
          .optional(),
      }),
    )
    .min(1, 'At least one output required'),
  webhookUrl: z.string().url().optional(),
  requestId: z.string().optional(),
});

export const ffmpegCompose = createTool({
  id: 'ffmpegCompose',
  description:
    'Run an arbitrary ffmpeg composition. Inputs are public URLs. Outputs are uploaded to NCA storage. Returns job_id for polling.',
  inputSchema,
  outputSchema: z.object({
    jobId: z.string(),
    status: z.enum(['queued', 'completed']),
    resultUrls: z.array(z.string().url()).optional(),
    message: z.string(),
  }),
  execute: async ({ inputs, filters, outputs, webhookUrl, requestId }) => {
    const resolvedWebhook = webhookUrl ?? env.NCA_DEFAULT_WEBHOOK_URL;

    const body = {
      inputs,
      ...(filters && filters.length > 0 && { filters }),
      outputs,
      ...(resolvedWebhook ? { webhook_url: resolvedWebhook } : {}),
      ...(requestId && { id: requestId }),
    };

    const result = await ncaRequest<{
      code: number;
      job_id: string;
      response: string[] | null;
      message: string;
    }>('/v1/ffmpeg/compose', body);

    const isCompleted = Array.isArray(result.response) && result.response.length > 0;

    return {
      jobId: result.job_id,
      status: (isCompleted ? 'completed' : 'queued') as 'completed' | 'queued',
      resultUrls: isCompleted ? result.response! : undefined,
      message: result.message,
    };
  },
});
