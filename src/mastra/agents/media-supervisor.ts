import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';

import { videoAgent } from './video-agent';
import { audioAgent } from './audio-agent';
import { mediaAgent } from './media-agent';
import { imageAgent } from './image-agent';
import { toolkitAgent } from './toolkit-agent';
import { answerRelevancyScorer } from '../scorers/_example.scorers';
import { env } from '../../lib/env';

export const mediaSupervisorAgent = new Agent({
  id: 'mediaSupervisor',
  name: 'Media Supervisor',
  description: 'Coordinates multi-step NCA workflows by delegating to specialist agents (video, audio, media, image, toolkit). Use for complex media pipelines that span multiple endpoint categories.',
  instructions: `You coordinate media processing tasks by delegating to domain-specific agents.

Available agents:
- videoAgent: all video operations — captioning, trimming, concatenating, cutting segments, splitting, thumbnail extraction
- audioAgent: all audio operations — concatenating audio files
- mediaAgent: generic media operations — transcription, ffmpeg composition, cutting, ASS subtitle generation, metadata, silence detection, format conversion, MP3 conversion
- imageAgent: image operations — webpage screenshots, image-to-video (Ken Burns effect)
- toolkitAgent: utility operations — NCA health check, single job status polling, bulk job status listing

Delegation rules:
1. Any video file operation → videoAgent
2. Any audio file operation (not conversion) → audioAgent
3. Transcription, ffmpeg, metadata, silence, conversion → mediaAgent
4. Screenshots or image processing → imageAgent
5. Health checks, job status queries → toolkitAgent
6. When unsure, prefer mediaAgent for generic audio/video and videoAgent for video-specific tasks

Rules:
- ALL source media MUST be at publicly-accessible URLs. Refuse local file paths.
- Subagents handle job polling internally — do not poll separately.
- Synthesize the subagent response into a clear, concise reply for the user.`,
  model: 'anthropic/claude-haiku-4-5',
  agents: {
    videoAgent,
    audioAgent,
    mediaAgent,
    imageAgent,
    toolkitAgent,
  },
  memory: new Memory(),
  scorers: {
    answerRelevancy: {
      scorer: answerRelevancyScorer,
      sampling: { type: 'ratio', rate: env.USE_AIMOCK ? 0 : 1 },
    },
  },
});
