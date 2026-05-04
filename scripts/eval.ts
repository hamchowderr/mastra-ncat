import { readFileSync } from 'fs';
import { resolve } from 'path';

// Boot Mastra (env validation + AIMock + storage)
import { mastra } from '../src/mastra/index';
import { env } from '../src/lib/env';
import {
  createToolCallAccuracyScorerCode,
  answerRelevancyScorer,
} from '../src/mastra/scorers/_example.scorers';

// ── types ─────────────────────────────────────────────────────────────────────

interface EvalCase {
  name: string;
  input: string;
  /** Name of the tool expected to be called. null = no tool should be called. */
  expectedTool: string | null;
  /** Keywords that must appear (case-insensitive) in the agent's text response. */
  expectedKeywords: string[];
}

interface Dataset {
  agentId: string;
  thresholds: Record<string, number>;
  cases: EvalCase[];
}

interface CaseResult {
  name: string;
  pass: boolean;
  errors: string[];
  scores: Record<string, number | null>;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

function extractToolName(tc: any): string | undefined {
  // Mastra wraps: { type: 'tool-call', payload: { toolName: '...' } }
  return tc?.payload?.toolName ?? tc?.toolName;
}

function collectToolNames(result: any): string[] {
  const names: string[] = [];
  if (Array.isArray(result.toolCalls)) {
    for (const tc of result.toolCalls) {
      const name = extractToolName(tc);
      if (name) names.push(name);
    }
  }
  if (Array.isArray(result.steps)) {
    for (const step of result.steps) {
      if (Array.isArray(step.toolCalls)) {
        for (const tc of step.toolCalls) {
          const name = extractToolName(tc);
          if (name) names.push(name);
        }
      }
    }
  }
  return [...new Set(names)];
}

// ── main ──────────────────────────────────────────────────────────────────────

const datasetPath = process.argv[2]
  ?? resolve(process.cwd(), 'src/mastra/scorers/datasets/_example.json');

const dataset: Dataset = JSON.parse(readFileSync(datasetPath, 'utf-8'));
const agent = mastra.getAgent(dataset.agentId);

if (!agent) {
  console.error(red(`Agent "${dataset.agentId}" not found in Mastra instance.`));
  process.exit(1);
}

console.log(bold(`\n🧪 Eval: ${dataset.agentId} — ${dataset.cases.length} cases\n`));

const results: CaseResult[] = [];
const relevancyScores: number[] = [];

for (const evalCase of dataset.cases) {
  process.stdout.write(`  ${evalCase.name} ... `);

  let text = '';
  let toolNames: string[] = [];
  let scoringInput: unknown;
  let scoringOutput: unknown;

  try {
    const generateOpts = env.USE_AIMOCK
      ? {}
      : { returnScorerData: true };

    const result = await agent.generate(
      [{ role: 'user', content: evalCase.input }],
      generateOpts as Parameters<typeof agent.generate>[1],
    );

    text = result.text ?? '';
    toolNames = collectToolNames(result);
    scoringInput = (result as any).scoringData?.input;
    scoringOutput = (result as any).scoringData?.output;
  } catch (err) {
    console.log(red('ERROR'));
    console.error(`    ${err}`);
    results.push({ name: evalCase.name, pass: false, errors: [`generate failed: ${err}`], scores: {} });
    continue;
  }

  const errors: string[] = [];

  // Tool-call assertion — skipped under AIMock (text-only responses, no tool dispatch)
  if (!env.USE_AIMOCK) {
    if (evalCase.expectedTool === null) {
      if (toolNames.length > 0) {
        errors.push(`expected no tool call, but agent called: ${toolNames.join(', ')}`);
      }
    } else {
      if (!toolNames.includes(evalCase.expectedTool)) {
        errors.push(`expected tool "${evalCase.expectedTool}", got: [${toolNames.join(', ') || 'none'}]`);
      }
    }
  }

  // Keyword assertions (against full response text)
  for (const kw of evalCase.expectedKeywords) {
    if (!text.toLowerCase().includes(kw.toLowerCase())) {
      errors.push(`expected keyword "${kw}" not found in response`);
    }
  }

  // Per-case toolCallAccuracy scorer (requires expectedTool; skip for null)
  const scores: Record<string, number | null> = {};

  if (evalCase.expectedTool !== null && !env.USE_AIMOCK && scoringInput !== undefined && scoringOutput !== undefined) {
    try {
      const toolScorer = createToolCallAccuracyScorerCode({
        expectedTool: evalCase.expectedTool,
      });
      const toolResult = await toolScorer.run({
        input: scoringInput as any,
        output: scoringOutput as any,
      });
      scores.toolCallAccuracy = toolResult.score;
    } catch (err) {
      console.error(yellow(`\n    ⚠ toolCallAccuracy scorer error: ${err}`));
    }
  }

  // answerRelevancy scorer (LLM-judged; skip under AIMock)
  if (!env.USE_AIMOCK && scoringInput !== undefined && scoringOutput !== undefined) {
    try {
      const relResult = await answerRelevancyScorer.run({
        input: scoringInput as any,
        output: scoringOutput as any,
      });
      scores.answerRelevancy = relResult.score;
      if (relResult.score !== null) relevancyScores.push(relResult.score);
    } catch (err) {
      console.error(yellow(`\n    ⚠ answerRelevancy scorer error: ${err}`));
    }
  }

  const pass = errors.length === 0;
  results.push({ name: evalCase.name, pass, errors, scores });

  if (pass) {
    console.log(green('PASS'));
  } else {
    console.log(red('FAIL'));
    for (const err of errors) console.log(`    ${red('✗')} ${err}`);
  }

  const scoreStr = Object.entries(scores)
    .map(([k, v]) => `${k}=${v !== null ? v.toFixed(2) : 'n/a'}`)
    .join(' ');
  if (scoreStr) console.log(`    scores: ${scoreStr}`);
}

// ── aggregate summary ─────────────────────────────────────────────────────────

console.log(bold('\n── Aggregate Scores ─────────────────────────────────────────'));

const scorerPass: Record<string, boolean | 'skip'> = {};

const avgRelevancy = relevancyScores.length > 0
  ? relevancyScores.reduce((a, b) => a + b, 0) / relevancyScores.length
  : null;

const relevancyThreshold = dataset.thresholds.answerRelevancy ?? 0.7;
const relevancyResult = avgRelevancy === null ? 'skip' : avgRelevancy >= relevancyThreshold;
scorerPass.answerRelevancy = relevancyResult;

const relLabel = avgRelevancy === null
  ? yellow(`  answerRelevancy: n/a (skipped — no scorer data)`)
  : relevancyResult
  ? green(`  answerRelevancy: ${avgRelevancy.toFixed(3)} ≥ ${relevancyThreshold} ✓`)
  : red(`  answerRelevancy: ${avgRelevancy.toFixed(3)} < ${relevancyThreshold} ✗`);
console.log(relLabel);

const failCount = results.filter(r => !r.pass).length;
console.log(bold('\n── Case Assertions ───────────────────────────────────────────'));
console.log(`  ${results.length - failCount}/${results.length} cases passed`);

const allScorersPassed = Object.values(scorerPass).every(v => v === true || v === 'skip');
const allCasesPassed = failCount === 0;
const exitCode = allCasesPassed && allScorersPassed ? 0 : 1;

if (exitCode === 0) {
  console.log(bold(green('\n✅ All checks passed\n')));
} else {
  console.log(bold(red('\n❌ Some checks failed\n')));
}

process.exit(exitCode);
