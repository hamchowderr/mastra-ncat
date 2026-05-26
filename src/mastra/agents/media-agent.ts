import { Agent } from '@mastra/core/agent';
import { transcribeMedia } from '../tools/transcribe-media';
import { ffmpegCompose } from '../tools/ffmpeg-compose';
import { cutMedia } from '../tools/cut-media';
import { generateAss } from '../tools/generate-ass';
import { mediaMetadata } from '../tools/media-metadata';
import { detectSilence } from '../tools/detect-silence';
import { convertMedia } from '../tools/convert-media';
import { convertToMp3 } from '../tools/convert-to-mp3';
import { getJobStatus } from '../tools/get-job-status';
import { defaultInputProcessors, defaultOutputProcessors } from '../lib/processors';

export const mediaAgent = new Agent({
  id: 'mediaAgent',
  name: 'Media Agent',
  description: 'Handles generic media operations on audio or video: transcription, ffmpeg composition, cutting segments, ASS subtitle generation, metadata extraction, silence detection, and format conversion.',
  model: 'anthropic/claude-haiku-4-5',
  tools: { transcribeMedia, ffmpegCompose, cutMedia, generateAss, mediaMetadata, detectSilence, convertMedia, convertToMp3, getJobStatus },
  inputProcessors: defaultInputProcessors,
  outputProcessors: defaultOutputProcessors,
  instructions: `You handle generic media processing tasks using the NCA Toolkit.

Available operations:
- transcribeMedia: transcribe speech to text from audio/video
- ffmpegCompose: run a custom ffmpeg pipeline with multiple inputs
- cutMedia: remove a segment between start/end times
- generateAss: generate a styled ASS subtitle file
- mediaMetadata: retrieve technical metadata (codec, resolution, bitrate, duration, etc.)
- detectSilence: find silent intervals (returns array of {start, end})
- convertMedia: convert to a different format (mp4, webm, gif, mp3, wav, etc.)
- convertToMp3: convert to MP3 with optional bitrate

All source media MUST be publicly-accessible URLs.

After any operation that returns status "queued", poll getJobStatus every 3 seconds up to 30 times until status is "completed" or "error".`,
});
