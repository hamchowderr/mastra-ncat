import { Agent } from '@mastra/core/agent';

import { ncaTest } from '../tools/nca-test';
import { captionVideo } from '../tools/caption-video';
import { transcribeMedia } from '../tools/transcribe-media';
import { ffmpegCompose } from '../tools/ffmpeg-compose';
import { getJobStatus } from '../tools/get-job-status';
import { answerRelevancyScorer } from '../scorers/_example.scorers';
import { env } from '../../lib/env';
import { defaultInputProcessors, defaultOutputProcessors } from '../lib/processors';
import { createDefaultMemory } from '../lib/memory';

/**
 * # Media Processor Agent (canonical example)
 *
 * What it does:
 *   Processes media via the NCA Toolkit. Captions videos, transcribes audio,
 *   composes ffmpeg pipelines. Polls long-running jobs via getJobStatus.
 *
 * Who calls it:
 *   - Studio chat (development)
 *   - Next.js API routes / n8n webhooks
 *   POST /api/agents/mediaProcessor/generate
 *
 * Env vars required:
 *   - NCA_BASE_URL, NCA_API_KEY
 *   - ANTHROPIC_API_KEY (default agent model)
 *
 * How to test:
 *   curl -X POST http://localhost:4111/api/agents/mediaProcessor/generate \
 *     -H "Content-Type: application/json" \
 *     -d '{"messages":[{"role":"user","content":"Transcribe this video: https://example.com/sample.mp4"}]}'
 *
 * Pre-flight:
 *   Ensure NCA is reachable: `npm run nca:ping`
 */

export const mediaProcessorAgent = new Agent({
  id: 'mediaProcessor',
  name: 'Media Processor',
  description: 'General-purpose NCA media processor. Routes media tasks across NCA Toolkit endpoints (transcription, captioning, ffmpeg compose, job polling). Reference implementation for the family.',
  instructions: `You process media files (video, audio) by calling NCA Toolkit tools.

Available operations:
- captionVideo: add captions to a video
- transcribeMedia: convert audio/video to text
- ffmpegCompose: arbitrary ffmpeg composition
- ncaTest: verify NCA deployment is healthy
- getJobStatus: poll a previously-started job

Rules:
- ALL source media MUST be at publicly-accessible URLs. If the user provides a local file path, refuse and ask for a URL.
- For long-running operations (captioning a long video, complex ffmpeg), the tool will return status="queued" with a job_id. Use getJobStatus to poll. Wait 3 seconds between polls. Max 30 polls (~90 seconds).
- If a job returns status="failed", report the error to the user. Do not retry automatically.
- When in doubt about the deployment, call ncaTest first to verify connectivity.
- Be explicit about what you're doing in your responses (e.g., "Starting transcription... job_id: abc-123. Polling..."). Users want to see progress.
- Cite the result URL when an operation completes.`,
  model: 'anthropic/claude-haiku-4-5',
  tools: { ncaTest, captionVideo, transcribeMedia, ffmpegCompose, getJobStatus },
  memory: createDefaultMemory(),
  // Shared safety/hygiene baseline — see src/mastra/lib/processors.ts.
  inputProcessors: defaultInputProcessors,
  outputProcessors: defaultOutputProcessors,
  scorers: {
    answerRelevancy: {
      scorer: answerRelevancyScorer,
      sampling: { type: 'ratio', rate: env.USE_AIMOCK ? 0 : 1 },
    },
  },
});
