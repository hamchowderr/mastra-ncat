import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '../../lib/env';
import { ncaRequest } from '../lib/nca';

export const screenshotWebpage = createTool({
  id: 'screenshotWebpage',
  description: 'Capture a screenshot of a webpage by URL. Returns the image URL.',
  inputSchema: z.object({
    url: z.string().url().optional(),
    html: z.string().optional(),
    viewportWidth: z.number().optional(),
    viewportHeight: z.number().optional(),
    fullPage: z.boolean().optional(),
    format: z.enum(['png', 'jpeg']).optional(),
    delay: z.number().optional(),
    selector: z.string().optional(),
    webhookUrl: z.string().url().optional(),
    requestId: z.string().optional(),
  }).refine(d => d.url || d.html, { message: 'Either url or html is required' }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.enum(['queued', 'completed']),
    resultUrl: z.string().url().optional(),
    message: z.string(),
  }),
  execute: async ({ url, html, viewportWidth, viewportHeight, fullPage, format, delay, selector, webhookUrl, requestId }) => {
    const body = {
      ...(url && { url }),
      ...(html && { html }),
      ...(viewportWidth && { viewport_width: viewportWidth }),
      ...(viewportHeight && { viewport_height: viewportHeight }),
      ...(fullPage !== undefined && { full_page: fullPage }),
      ...(format && { format }),
      ...(delay !== undefined && { delay }),
      ...(selector && { selector }),
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
    }>('/v1/image/screenshot/webpage', body);

    const isCompleted = typeof result.response === 'string' && result.response.length > 0;

    return {
      jobId: result.job_id,
      status: isCompleted ? 'completed' as const : 'queued' as const,
      resultUrl: isCompleted ? result.response! : undefined,
      message: result.message,
    };
  },
});
