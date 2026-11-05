import { z } from 'zod';

export const storySchema = z.object({
  url: z.string(),
  title: z.string(),
  status: z.string(),
  sprints: z.array(z.string()),
  assignees: z.array(z.string()),
  reviewers: z.array(z.string()),
  supporters: z.array(z.string()),
  priority: z.string(),
  hasDescription: z.boolean(),
});
export type Story = z.infer<typeof storySchema>;

export const pullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  author: z.string(),
  branch: z.string(),
  body: z.string(),
  url: z.string(),
  draft: z.boolean(),
  createdAt: z.string(),
  reviewCount: z.number(),
});
export type PullRequest = z.infer<typeof pullRequestSchema>;

export const findingSchema = z.object({
  code: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
  text: z.string(),
  owner: z.string().optional(),
  storyId: z.string().optional(),
});
export type Finding = z.infer<typeof findingSchema>;

export const REVIEW_WAIT_HOURS = 2;

/** "US 2.2", "us-2.2" and "US2.2" all become "US-2.2". */
export function extractStoryId(text: string): string | undefined {
  const match = text.match(/\bUS[\s_-]?(\d+\.\d+)\b/i);
  return match ? `US-${match[1]}` : undefined;
}

function isUserStory(story: Story): boolean {
  return extractStoryId(story.title) !== undefined;
}

function statusIs(story: Story, status: string): boolean {
  return story.status.trim().toLowerCase() === status;
}

/** Latest sprint on the board that still has unfinished work, else the latest sprint. */
export function currentSprint(stories: Story[]): string | undefined {
  const sprintNumber = (name: string) => Number(name.match(/\d+/)?.[0] ?? -1);
  const latest = (names: string[]) =>
    [...names].sort((a, b) => sprintNumber(b) - sprintNumber(a))[0];
  const open = stories.filter((s) => !statusIs(s, 'done')).flatMap((s) => s.sprints);
  return latest(open) ?? latest(stories.flatMap((s) => s.sprints));
}

export function runRules(
  stories: Story[],
  pullRequests: PullRequest[],
  failedChecks: string[],
  now: Date,
): Finding[] {
  const findings: Finding[] = [];
  const sprint = currentSprint(stories);
  const prStoryIds = new Set(
    pullRequests
      .map((pr) => extractStoryId(`${pr.title} ${pr.branch} ${pr.body}`))
      .filter((id): id is string => id !== undefined),
  );

  for (const name of failedChecks) {
    findings.push({
      code: 'main-check-failing',
      severity: 'high',
      text: `Workflow "${name}" đang fail trên main.`,
    });
  }

  const byId = new Map<string, Story[]>();
  for (const story of stories) {
    const id = extractStoryId(story.title);
    if (id) byId.set(id, [...(byId.get(id) ?? []), story]);
  }
  for (const [id, matches] of byId) {
    if (matches.length > 1) {
      findings.push({
        code: 'duplicate-story-id',
        severity: 'high',
        storyId: id,
        text: `Mã ${id} đang dùng cho ${matches.length} story khác nhau.`,
      });
    }
  }

  for (const story of stories) {
    const id = extractStoryId(story.title);
    const label = story.title.trim();

    if (!label) {
      findings.push({ code: 'blank-row', severity: 'low', text: 'Backlog có dòng chưa đặt tên.' });
      continue;
    }

    if (statusIs(story, 'in progress')) {
      if (story.assignees.length === 0) {
        findings.push({
          code: 'in-progress-no-assignee',
          severity: 'high',
          storyId: id,
          text: `"${label}" đang In Progress nhưng chưa có Assignee.`,
        });
      }
      if (id && !prStoryIds.has(id)) {
        findings.push({
          code: 'in-progress-no-pr',
          severity: 'medium',
          storyId: id,
          owner: story.assignees[0],
          text: `"${label}" đang In Progress nhưng chưa có PR mở gắn mã ${id}.`,
        });
      }
    }

    const inCurrentSprint = sprint !== undefined && story.sprints.includes(sprint);
    if (inCurrentSprint && isUserStory(story) && statusIs(story, 'done')) {
      const missing = [
        story.assignees.length === 0 ? 'Assignee' : undefined,
        story.reviewers.length === 0 ? 'Reviewer' : undefined,
      ].filter(Boolean);
      if (missing.length > 0) {
        findings.push({
          code: 'done-missing-people',
          severity: 'medium',
          storyId: id,
          text: `"${label}" đã Done nhưng thiếu ${missing.join(' và ')}.`,
        });
      }
    }

    if (isUserStory(story) && statusIs(story, 'not started')) {
      if (!story.hasDescription) {
        findings.push({
          code: 'story-not-ready',
          severity: 'medium',
          storyId: id,
          text: `"${label}" chưa có mô tả nên chưa sẵn sàng để nhận.`,
        });
      }
      if (story.assignees.length === 0) {
        findings.push({
          code: 'story-unassigned',
          severity: 'low',
          storyId: id,
          text: `"${label}" chưa có người nhận.`,
        });
      }
    }
  }

  for (const pr of pullRequests) {
    if (pr.draft) continue;
    if (!extractStoryId(`${pr.title} ${pr.branch} ${pr.body}`)) {
      findings.push({
        code: 'pr-no-story',
        severity: 'medium',
        owner: pr.author,
        text: `PR #${pr.number} "${pr.title}" chưa gắn mã story.`,
      });
    }
    const ageHours = (now.getTime() - new Date(pr.createdAt).getTime()) / 3_600_000;
    if (pr.reviewCount === 0 && ageHours >= REVIEW_WAIT_HOURS) {
      findings.push({
        code: 'pr-waiting-review',
        severity: 'high',
        text: `PR #${pr.number} "${pr.title}" đã chờ review ${Math.floor(ageHours)} giờ.`,
      });
    }
  }

  const order = { high: 0, medium: 1, low: 2 } as const;
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Everyone the board already knows about; AI suggestions may only name these people. */
export function teamRoster(stories: Story[]): string[] {
  return [
    ...new Set(stories.flatMap((s) => [...s.assignees, ...s.reviewers, ...s.supporters])),
  ].sort();
}

/** Open work per person, so nobody gets suggested more work while already overloaded. */
export function workload(stories: Story[]): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(
    teamRoster(stories).map((name) => [name, 0]),
  );
  for (const story of stories) {
    if (!statusIs(story, 'in progress')) continue;
    for (const name of story.assignees) counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}
