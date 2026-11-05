import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Client } from '@notionhq/client';
import { readBacklog, replaceBotBlocks } from './sources.ts';

const blockLimit = Object.assign(new Error('no free blocks'), {
  additional_data: { block_limit: 'block_creation' },
});

function fakePage(options: { appendError?: Error; botBlocks?: { id: string; type: string }[] } = {}) {
  const calls: string[] = [];
  const bot = options.botBlocks ?? [{ id: 'old-brief', type: 'paragraph' }];
  const client = {
    users: { me: async () => ({ id: 'bot' }) },
    blocks: {
      children: {
        list: async () => ({
          results: [
            ...bot.map((block) => ({ ...block, created_by: { id: 'bot' } })),
            { id: 'human-note', type: 'paragraph', created_by: { id: 'person' } },
          ],
          has_more: false,
          next_cursor: null,
        }),
        append: async () => {
          calls.push('append');
          if (options.appendError) throw options.appendError;
        },
      },
      update: async ({ block_id }: { block_id: string }) => {
        calls.push(`update ${block_id}`);
      },
      delete: async ({ block_id }: { block_id: string }) => {
        calls.push(`delete ${block_id}`);
      },
    },
    pages: { retrieve: async () => ({ url: 'https://www.notion.so/brief' }) },
  } as unknown as Client;
  return { client, calls };
}

test('replaceBotBlocks adds the new brief before removing only the bot blocks', async () => {
  const { client, calls } = fakePage();
  const url = await replaceBotBlocks(client, 'page', [], 'brief');
  assert.deepEqual(calls, ['append', 'delete old-brief']);
  assert.equal(url, 'https://www.notion.so/brief');
});

test('replaceBotBlocks keeps the previous brief on an unexpected error', async () => {
  const { client, calls } = fakePage({ appendError: new Error('network') });
  await assert.rejects(replaceBotBlocks(client, 'page', [], 'brief'));
  assert.deepEqual(calls, ['append']);
});

test('out of free blocks, the brief goes into one existing bot block', async () => {
  const { client, calls } = fakePage({
    appendError: blockLimit,
    botBlocks: [
      { id: 'old-heading', type: 'heading_1' },
      { id: 'old-text', type: 'paragraph' },
    ],
  });
  await replaceBotBlocks(client, 'page', [], 'brief');
  assert.deepEqual(calls, ['append', 'update old-text', 'delete old-heading']);
});

const row = (title: string, overrides: Record<string, unknown> = {}) => ({
  url: `https://www.notion.so/${title}`,
  properties: {
    'Backlog Item': { type: 'title', title: [{ plain_text: title }] },
    Status: { type: 'status', status: { name: 'In Progress' } },
    Description: { type: 'rich_text', rich_text: [] },
    Sprint: { type: 'multi_select', multi_select: [{ name: 'Sprint 4' }, { name: 'Sprint 3' }] },
    Priority: { type: 'multi_select', multi_select: [{ name: 'High' }, { name: 'Medium' }] },
    Assignee: { type: 'people', people: [{ name: 'Dev A' }, { id: 'no-name-visible' }] },
    Reviewer: { type: 'people', people: [] },
    Support: { type: 'people', people: [{ name: 'Dev B' }] },
    ...overrides,
  },
});

function fakeNotion(pages: { results: unknown[]; has_more: boolean; next_cursor: string | null }[]) {
  const cursors: (string | undefined)[] = [];
  const client = {
    databases: { retrieve: async () => ({ data_sources: [{ id: 'source-1' }] }) },
    dataSources: {
      query: async (args: { start_cursor?: string }) => {
        cursors.push(args.start_cursor);
        return pages[cursors.length - 1];
      },
    },
  } as unknown as Client;
  return { client, cursors };
}

test('readBacklog maps the board columns', async () => {
  const { client } = fakeNotion([{ results: [row('US 3.3: AI')], has_more: false, next_cursor: null }]);
  const [story] = await readBacklog(client, 'db');
  assert.deepEqual(story, {
    url: 'https://www.notion.so/US 3.3: AI',
    title: 'US 3.3: AI',
    status: 'In Progress',
    sprints: ['Sprint 4', 'Sprint 3'],
    assignees: ['Dev A'],
    reviewers: [],
    supporters: ['Dev B'],
    priority: 'High, Medium',
    hasDescription: false,
  });
});

test('readBacklog accepts select columns and filled descriptions', async () => {
  const { client } = fakeNotion([
    {
      results: [
        row('US 1.1', {
          Status: { type: 'select', select: { name: 'Done' } },
          Sprint: { type: 'select', select: { name: 'Sprint 2' } },
          Priority: { type: 'select', select: { name: 'Low' } },
          Description: { type: 'rich_text', rich_text: [{ plain_text: 'A story' }] },
        }),
      ],
      has_more: false,
      next_cursor: null,
    },
  ]);
  const [story] = await readBacklog(client, 'db');
  assert.equal(story?.status, 'Done');
  assert.deepEqual(story?.sprints, ['Sprint 2']);
  assert.equal(story?.priority, 'Low');
  assert.equal(story?.hasDescription, true);
});

test('readBacklog follows pagination', async () => {
  const { client, cursors } = fakeNotion([
    { results: [row('US 1.1')], has_more: true, next_cursor: 'next' },
    { results: [row('US 1.2')], has_more: false, next_cursor: null },
  ]);
  const stories = await readBacklog(client, 'db');
  assert.equal(stories.length, 2);
  assert.deepEqual(cursors, [undefined, 'next']);
});

test('a renamed column is empty instead of crashing', async () => {
  const { client } = fakeNotion([
    {
      results: [{ url: 'u', properties: { Name: { type: 'title', title: [{ plain_text: 'x' }] } } }],
      has_more: false,
      next_cursor: null,
    },
  ]);
  const [story] = await readBacklog(client, 'db');
  assert.equal(story?.title, '');
  assert.deepEqual(story?.assignees, []);
});
