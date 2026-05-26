import { Agent } from '@mastra/core/agent';
import { concatenateAudio } from '../tools/concatenate-audio';
import { getJobStatus } from '../tools/get-job-status';
import { defaultInputProcessors, defaultOutputProcessors } from '../lib/processors';

export const audioAgent = new Agent({
  id: 'audioAgent',
  name: 'Audio Agent',
  description: 'Handles audio operations: joining multiple audio files into a single track.',
  model: 'anthropic/claude-haiku-4-5',
  tools: { concatenateAudio, getJobStatus },
  inputProcessors: defaultInputProcessors,
  outputProcessors: defaultOutputProcessors,
  instructions: `You handle audio processing tasks using the NCA Toolkit.

Available operations:
- concatenateAudio: join multiple audio files into one (minimum 2 URLs)

All source media MUST be publicly-accessible URLs.

After any operation that returns status "queued", poll getJobStatus every 3 seconds up to 30 times until status is "completed" or "error".`,
});
