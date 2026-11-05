import { z } from 'zod';
import type { Finding } from './rules.ts';

export const managerPlanSchema = z.object({
  summary: z.string().describe('Tối đa 3 câu tiếng Việt về tình hình sprint'),
  actions: z
    .array(
      z.object({
        owner: z.string().describe('Tên đúng như trong roster, hoặc "PO/SM" nếu cần quyết định chung'),
        action: z.string().describe('Một việc cụ thể, bắt đầu bằng động từ'),
        why: z.string().describe('Lý do ngắn, dựa trên dữ liệu được cung cấp'),
      }),
    )
    .max(9),
});
export type ManagerPlan = z.infer<typeof managerPlanSchema>;

export const briefSchema = z.object({
  title: z.string(),
  summary: z.string(),
  findings: z.array(z.object({ severity: z.string(), text: z.string() })),
  actions: z.array(managerPlanSchema.shape.actions.element),
  aiUsed: z.boolean(),
});
export type Brief = z.infer<typeof briefSchema>;

/** AI output is untrusted: only keep suggestions addressed to real team members. */
export function keepValidActions(plan: ManagerPlan, roster: string[]): ManagerPlan['actions'] {
  const allowed = new Set([...roster, 'PO/SM']);
  return plan.actions.filter((action) => allowed.has(action.owner));
}

/** The brief still works without AI: every finding becomes something to check. */
export function fallbackActions(findings: Finding[]): ManagerPlan['actions'] {
  return findings
    .filter((finding) => finding.severity !== 'low')
    .slice(0, 9)
    .map((finding) => ({
      owner: finding.owner ?? 'PO/SM',
      action: finding.text,
      why: 'Phát hiện bằng rule, chưa qua AI.',
    }));
}

export function renderBrief(brief: Brief): string {
  const lines = [`# ${brief.title}`, '', brief.summary, '', '## Việc đề xuất (chờ PO/SM duyệt)'];
  lines.push(...brief.actions.map((a) => `- [ ] ${a.owner}: ${a.action} (${a.why})`));
  lines.push('', '## Phát hiện');
  lines.push(...brief.findings.map((f) => `- [${f.severity}] ${f.text}`));
  return lines.join('\n');
}
