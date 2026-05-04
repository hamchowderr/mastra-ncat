import { ncaHealthcheck } from '../src/mastra/lib/nca';

async function main() {
  console.log('Pinging NCA Toolkit...');
  try {
    await ncaHealthcheck();
    console.log('✓ NCA Toolkit is reachable and API key is valid.');
    process.exit(0);
  } catch (err) {
    console.error('✗ NCA ping failed:');
    console.error(err);
    process.exit(1);
  }
}

main();
