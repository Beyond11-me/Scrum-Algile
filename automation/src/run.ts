import { Mastra } from '@mastra/core';
import { renderBrief } from './brief.ts';

// The app and this bot share the team's naming; Mastra's Google provider reads a different name.
if (process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
}

// Imported after the key is mapped so the agent sees the final environment.
const { aiManagerWorkflow, manager } = await import('./workflow.ts');

const demo = process.argv.includes('--demo');
const dryRun = demo || process.argv.includes('--dry-run');
// Actions logs are public on this repository, so board content is never printed in CI.
const inCI = process.env.CI === 'true';

// Registering the agent makes it use this silent logger, so errors stay out of public logs.
const mastra = new Mastra({ agents: { manager }, workflows: { aiManagerWorkflow }, logger: false });
const run = await mastra.getWorkflow('aiManagerWorkflow').createRun();
const result = await run.start({ inputData: { demo, publish: !dryRun } });

if (result.status !== 'success') {
  console.error(`AI Manager stopped with status: ${result.status}`);
  if (!inCI && result.status === 'failed') console.error(result.error);
  process.exit(1);
}

const { brief, publishedUrl } = result.result;
if (!inCI) console.log(renderBrief(brief));
console.log(
  `AI Manager done: ${brief.actions.length} actions, ${brief.findings.length} findings, AI ${brief.aiUsed ? 'used' : 'not used'}, ${publishedUrl ? 'published to Notion' : 'not published'}.`,
);
