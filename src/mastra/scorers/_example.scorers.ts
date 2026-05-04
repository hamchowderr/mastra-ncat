import { createAnswerRelevancyScorer } from '@mastra/evals/scorers/prebuilt';

// LLM-judged relevancy — runs on every agent invocation as an agent-level scorer.
export const answerRelevancyScorer = createAnswerRelevancyScorer({
  model: 'anthropic/claude-haiku-4-5',
});

// createToolCallAccuracyScorerCode requires expectedTool at construction time
// (per-case), so it is used in scripts/eval.ts per case rather than here.
export { createToolCallAccuracyScorerCode } from '@mastra/evals/scorers/prebuilt';
