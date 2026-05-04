import { Agent } from '@mastra/core/agent';
import { screenshotWebpage } from '../tools/screenshot-webpage';
import { imageToVideo } from '../tools/image-to-video';
import { getJobStatus } from '../tools/get-job-status';

export const imageAgent = new Agent({
  id: 'imageAgent',
  name: 'Image Agent',
  description: 'Handles image operations: capturing webpage screenshots and converting static images to video with Ken Burns effect.',
  model: 'anthropic/claude-haiku-4-5',
  tools: { screenshotWebpage, imageToVideo, getJobStatus },
  instructions: `You handle image processing tasks using the NCA Toolkit.

Available operations:
- screenshotWebpage: capture a screenshot of a webpage URL or raw HTML string. Either url or html must be provided. Supports viewport sizing, full-page capture, format (png/jpeg), delay, and CSS selector.
- imageToVideo: convert a static image to a video with Ken Burns (pan and zoom) effect. Optionally configure length (seconds), frameRate, and zoomSpeed.

After any operation that returns status "queued", poll getJobStatus every 3 seconds up to 30 times until status is "completed" or "error".`,
});
