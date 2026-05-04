import { execSync } from 'child_process';
import { readdirSync } from 'fs';
import { resolve } from 'path';

const datasetsDir = resolve(process.cwd(), 'src/mastra/scorers/datasets');
const datasets = readdirSync(datasetsDir)
  .filter(f => f.endsWith('.json'))
  .sort();

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

console.log(bold(`\n📋 Running ${datasets.length} eval datasets\n`));

const failures: string[] = [];

for (const dataset of datasets) {
  const path = resolve(datasetsDir, dataset);
  console.log(bold(`── ${dataset} ────────────────────────────────────────`));
  try {
    execSync(
      `node --import tsx/esm scripts/eval.ts ${path}`,
      { stdio: 'inherit', env: process.env },
    );
  } catch {
    failures.push(dataset);
  }
  console.log('');
}

console.log(bold('══ Summary ════════════════════════════════════════════'));
if (failures.length === 0) {
  console.log(bold(green(`✅ All ${datasets.length} datasets passed\n`)));
  process.exit(0);
} else {
  console.log(bold(red(`❌ ${failures.length}/${datasets.length} datasets failed:`)));
  for (const f of failures) console.log(red(`  • ${f}`));
  console.log('');
  process.exit(1);
}
