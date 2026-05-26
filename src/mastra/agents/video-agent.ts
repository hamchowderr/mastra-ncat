import { Agent } from '@mastra/core/agent';
import { captionVideo } from '../tools/caption-video';
import { trimVideo } from '../tools/trim-video';
import { concatenateVideos } from '../tools/concatenate-videos';
import { cutVideo } from '../tools/cut-video';
import { splitVideo } from '../tools/split-video';
import { videoThumbnail } from '../tools/video-thumbnail';
import { getJobStatus } from '../tools/get-job-status';
import { defaultInputProcessors, defaultOutputProcessors } from '../lib/processors';

export const videoAgent = new Agent({
  id: 'videoAgent',
  name: 'Video Agent',
  description: 'Handles all video operations: captioning, trimming, concatenating, cutting segments, splitting, and thumbnail extraction.',
  model: 'anthropic/claude-haiku-4-5',
  tools: { captionVideo, trimVideo, concatenateVideos, cutVideo, splitVideo, videoThumbnail, getJobStatus },
  inputProcessors: defaultInputProcessors,
  outputProcessors: defaultOutputProcessors,
  instructions: `You handle video processing tasks using the NCA Toolkit.

Available operations:
- captionVideo: burn SRT subtitles into a video
- trimVideo: trim to start/end timestamps
- concatenateVideos: join multiple videos into one (minimum 2 URLs)
- cutVideo: remove segments by time ranges
- splitVideo: split into multiple segments
- videoThumbnail: extract a thumbnail image at a specific second

All source media MUST be publicly-accessible URLs.

After any operation that returns status "queued", poll getJobStatus every 3 seconds up to 30 times until status is "completed" or "error".`,
});
