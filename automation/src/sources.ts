import { Client } from '@notionhq/client';
import type { BlockObjectRequest } from '@notionhq/client';
import type { PullRequest, Story } from './rules.ts';

type NotionProperty = {
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  status?: { name: string } | null;
  select?: { name: string } | null;
  multi_select?: { name: string }[];
  people?: { name?: string | null }[];
};

function text(property: NotionProperty | undefined): string {
  if (!property) return '';
  const rich = property.title ?? property.rich_text;
  if (rich) return rich.map((part) => part.plain_text).join('').trim();
  if (property.multi_select) return property.multi_select.map((option) => option.name).join(', ');
  return property.status?.name ?? property.select?.name ?? '';
}

function names(property: NotionProperty | undefined): string[] {
  if (!property) return [];
  if (property.multi_select) return property.multi_select.map((option) => option.name);
  if (property.select) return [property.select.name];
  return (property.people ?? []).flatMap((person) => (person.name ? [person.name] : []));
}

/** Reads the Product Backlog. Property names match the AIgile board. */
export async function readBacklog(notion: Client, databaseId: string): Promise<Story[]> {
  const database = (await notion.databases.retrieve({ database_id: databaseId })) as unknown as {
    data_sources: { id: string }[];
  };
  const dataSourceId = database.data_sources[0]?.id;
  if (!dataSourceId) throw new Error('The Notion database has no data source.');

  const stories: Story[] = [];
  let cursor: string | undefined;
  do {
    const page = await notion.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const row of page.results as unknown as {
      url: string;
      properties: Record<string, NotionProperty>;
    }[]) {
      const p = row.properties;
      stories.push({
        url: row.url,
        title: text(p['Backlog Item']),
        status: text(p['Status']),
        sprints: names(p['Sprint']),
        assignees: names(p['Assignee']),
        reviewers: names(p['Reviewer']),
        supporters: names(p['Support']),
        priority: text(p['Priority']),
        hasDescription: text(p['Description']).length > 0,
      });
    }
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return stories;
}

/**
 * Shows the new brief on the page and removes the bot's previous one, so repeated runs do
 * not use up the workspace's block allowance. Blocks written by people are left alone. The
 * new brief goes in first: if Notion rejects it, the previous brief stays in place.
 */
export async function replaceBotBlocks(
  notion: Client,
  pageId: string,
  children: BlockObjectRequest[],
  plainText: string,
): Promise<string> {
  const me = await notion.users.me({});
  const previous: { id: string; type?: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor });
    for (const block of page.results as unknown as {
      id: string;
      type?: string;
      created_by?: { id: string };
    }[]) {
      if (block.created_by?.id === me.id) previous.push(block);
    }
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);

  let keep: string | undefined;
  try {
    await notion.blocks.children.append({ block_id: pageId, children });
  } catch (error) {
    if (!isBlockLimitError(error)) throw error;
    // Out of free blocks: editing a block creates nothing new, so the whole brief lives in one.
    const rich_text = toRichText(plainText);
    const reusable = previous.find((block) => block.type === 'paragraph');
    if (reusable) {
      await notion.blocks.update({ block_id: reusable.id, paragraph: { rich_text } });
      keep = reusable.id;
    } else {
      await notion.blocks.children.append({
        block_id: pageId,
        children: [{ paragraph: { rich_text } }],
      });
    }
  }
  for (const { id } of previous) {
    if (id !== keep) await notion.blocks.delete({ block_id: id });
  }

  const page = (await notion.pages.retrieve({ page_id: pageId })) as unknown as { url: string };
  return page.url;
}

function isBlockLimitError(error: unknown): boolean {
  const data = (error as { additional_data?: { block_limit?: string } }).additional_data;
  return data?.block_limit === 'block_creation';
}

/** Notion allows 100 rich text items of 2000 characters each in one block. */
function toRichText(content: string) {
  const parts: { type: 'text'; text: { content: string } }[] = [];
  for (let i = 0; i < content.length && parts.length < 100; i += 1900) {
    parts.push({ type: 'text', text: { content: content.slice(i, i + 1900) } });
  }
  return parts;
}

async function github<T>(repo: string, path: string, token?: string): Promise<T> {
  const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'aigile-ai-manager',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`GitHub ${path} returned ${response.status}`);
  return (await response.json()) as T;
}

export async function readOpenPullRequests(repo: string, token?: string): Promise<PullRequest[]> {
  const pulls = await github<
    {
      number: number;
      title: string;
      user: { login: string } | null;
      head: { ref: string };
      body: string | null;
      html_url: string;
      draft: boolean;
      created_at: string;
    }[]
  >(repo, 'pulls?state=open&per_page=50', token);

  return Promise.all(
    pulls.map(async (pr) => {
      const reviews = await github<unknown[]>(repo, `pulls/${pr.number}/reviews?per_page=100`, token);
      return {
        number: pr.number,
        title: pr.title,
        author: pr.user?.login ?? 'unknown',
        branch: pr.head.ref,
        body: pr.body ?? '',
        url: pr.html_url,
        draft: pr.draft,
        createdAt: pr.created_at,
        reviewCount: reviews.length,
      };
    }),
  );
}

/** Workflows whose most recent finished run on main failed. */
export async function readFailedChecks(repo: string, token?: string): Promise<string[]> {
  const { workflow_runs: runs } = await github<{
    workflow_runs: { name: string; conclusion: string | null }[];
  }>(repo, 'actions/runs?branch=main&status=completed&per_page=30', token);

  const latest = new Map<string, string | null>();
  for (const run of runs) {
    if (!latest.has(run.name)) latest.set(run.name, run.conclusion);
  }
  return [...latest].filter(([, conclusion]) => conclusion === 'failure').map(([name]) => name);
}
