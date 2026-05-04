import { Agent } from '@mastra/core/agent';
import { ncaTest } from '../tools/nca-test';
import { getJobStatus } from '../tools/get-job-status';
import { getJobsStatus } from '../tools/get-jobs-status';

export const toolkitAgent = new Agent({
  id: 'toolkitAgent',
  name: 'Toolkit Agent',
  description: 'Handles NCA Toolkit utility operations: health checks, polling a single job by ID, and listing statuses of all recent jobs.',
  model: 'anthropic/claude-haiku-4-5',
  tools: { ncaTest, getJobStatus, getJobsStatus },
  instructions: `You handle NCA Toolkit utility tasks.

Available operations:
- ncaTest: verify the NCA Toolkit API is reachable and healthy
- getJobStatus: check the status of a single job by job ID. Poll every 3 seconds up to 30 times if waiting for completion.
- getJobsStatus: retrieve statuses of all recent jobs (synchronous — no polling needed). Optionally filter by sinceSeconds.`,
});
