import type { PullRequest, Story } from './rules.ts';

// Made-up data for `npm run manager:demo` and the tests. This repository is public,
// so never paste real board content or real names here.
const story = (overrides: Partial<Story> & Pick<Story, 'title' | 'status'>): Story => ({
  url: 'https://www.notion.so/demo',
  sprints: ['Sprint 4'],
  assignees: [],
  reviewers: [],
  supporters: [],
  priority: 'Medium',
  hasDescription: true,
  ...overrides,
});

export const demoNow = new Date('2026-11-05T10:00:00Z');

export const demoStories: Story[] = [
  story({ title: 'US 3.3: Trợ lý AI', status: 'In Progress', assignees: ['Dev A'], reviewers: ['Dev C'] }),
  story({ title: 'US 3.2: Nộp bài và nhận kết quả', status: 'Done' }),
  story({ title: 'US 1.7: Hồ sơ cá nhân', status: 'Done', assignees: ['Dev B'], reviewers: ['Dev C'] }),
  story({ title: 'US 4.1: Tạo Lab', status: 'Done', assignees: ['Dev B'], reviewers: ['Dev C'], sprints: ['Sprint 3'] }),
  story({ title: 'US 4.1: Bảng điểm', status: 'Done', assignees: ['Dev D'], reviewers: ['Dev C'] }),
  story({ title: 'US 2.3: Upload file .sql', status: 'Not Started', sprints: [], hasDescription: false }),
  story({ title: '', status: 'Not Started', sprints: [] }),
];

export const demoPullRequests: PullRequest[] = [
  {
    number: 101,
    title: 'Fix/config UI',
    author: 'dev-b',
    branch: 'fix/config-ui',
    body: '',
    url: 'https://github.com/example/repo/pull/101',
    draft: false,
    createdAt: '2026-11-05T05:00:00Z',
    reviewCount: 0,
  },
];

export const demoFailedChecks = ['Demo deploy'];
