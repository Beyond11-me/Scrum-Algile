import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoFailedChecks, demoNow, demoPullRequests, demoStories } from './demo-data.ts';
import { currentSprint, extractStoryId, runRules, workload } from './rules.ts';

const codes = () =>
  runRules(demoStories, demoPullRequests, demoFailedChecks, demoNow).map((f) => f.code);

test('extractStoryId normalizes the formats the team uses', () => {
  assert.equal(extractStoryId('US 2.2 fix 3'), 'US-2.2');
  assert.equal(extractStoryId('feat/us-2.2-qb-fix'), 'US-2.2');
  assert.equal(extractStoryId('feat(admin): add tags [US2.2]'), 'US-2.2');
  assert.equal(extractStoryId('Retro'), undefined);
  assert.equal(extractStoryId('focus 2.2'), undefined);
});

test('currentSprint is the latest sprint with unfinished work', () => {
  assert.equal(currentSprint(demoStories), 'Sprint 4');
});

test('runRules reports each problem in the demo board', () => {
  const found = codes();
  for (const code of [
    'main-check-failing',
    'duplicate-story-id',
    'in-progress-no-pr',
    'done-missing-people',
    'story-not-ready',
    'story-unassigned',
    'blank-row',
    'pr-no-story',
    'pr-waiting-review',
  ]) {
    assert.ok(found.includes(code), `missing ${code}`);
  }
});

test('runRules lists high severity first', () => {
  const findings = runRules(demoStories, demoPullRequests, demoFailedChecks, demoNow);
  assert.equal(findings[0]?.severity, 'high');
  assert.equal(findings.at(-1)?.severity, 'low');
});

test('a story with an open PR is not flagged as missing one', () => {
  const pr = { ...demoPullRequests[0]!, title: 'feat(ai): assistant [US-3.3]' };
  const findings = runRules(demoStories, [pr], [], demoNow);
  assert.ok(!findings.some((f) => f.code === 'in-progress-no-pr' && f.storyId === 'US-3.3'));
});

test('a fresh PR without reviews is not flagged yet', () => {
  const pr = { ...demoPullRequests[0]!, createdAt: demoNow.toISOString() };
  const findings = runRules(demoStories, [pr], [], demoNow);
  assert.ok(!findings.some((f) => f.code === 'pr-waiting-review'));
});

test('workload counts only in-progress stories', () => {
  assert.equal(workload(demoStories)['Dev A'], 1);
  assert.equal(workload(demoStories)['Dev B'], 0);
});
