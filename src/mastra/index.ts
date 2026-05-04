// 1. Env validation FIRST — crashes process if misconfigured
import { env } from '../lib/env';

// 2. AIMock provider switch — must run before any AI SDK client constructs
import { configureAIMock } from './lib/aimock';
configureAIMock();

// 3. Optional: NCA health check at boot
import { ncaHealthcheck } from './lib/nca';
if (env.NCA_HEALTHCHECK_ON_BOOT) {
  await ncaHealthcheck(); // throws on failure → process exits
}

// 4. Mastra imports — agents/tools constructed below now see the right base URLs
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { PostgresStore } from '@mastra/pg';
import { DuckDBStore } from '@mastra/duckdb';
import { MastraCompositeStore } from '@mastra/core/storage';
import { Observability, DefaultExporter, SensitiveDataFilter } from '@mastra/observability';

import { mediaProcessorAgent } from './agents/_example';
import { mediaSupervisorAgent } from './agents/media-supervisor';
import { videoAgent } from './agents/video-agent';
import { audioAgent } from './agents/audio-agent';
import { mediaAgent } from './agents/media-agent';
import { imageAgent } from './agents/image-agent';
import { toolkitAgent } from './agents/toolkit-agent';
import { answerRelevancyScorer } from './scorers/_example.scorers';

export const mastra = new Mastra({
  agents: {
    mediaProcessor: mediaProcessorAgent,
    mediaSupervisor: mediaSupervisorAgent,
    videoAgent,
    audioAgent,
    mediaAgent,
    imageAgent,
    toolkitAgent,
  },
  scorers: { answerRelevancyScorer },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new PostgresStore({ id: 'mastra-storage', connectionString: env.SUPABASE_DB_URL }),
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    },
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: env.LOG_LEVEL,
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [new DefaultExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});
