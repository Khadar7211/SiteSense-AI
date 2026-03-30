import type { ParsedTask, TaskWithMetrics } from "@/types/progress";

export function taskProgressDecimal(actual: number, total: number): number {
  if (total <= 0) return actual > 0 ? 1 : 0;
  const p = actual / total;
  return Math.min(1, Math.max(0, p));
}

export function buildTaskMetrics(
  tasks: ParsedTask[],
  weightageByTaskId: Record<string, number>
): TaskWithMetrics[] {
  return tasks.map((t) => {
    const w = weightageByTaskId[t.id] ?? 0;
    const tp =
      t.totalQty > 0
        ? taskProgressDecimal(t.actualQty, t.totalQty) * 100
        : Math.min(100, Math.max(0, t.physicalProgressPct));
    const achieved = tp * (w / 100);
    const pathSegments =
      t.pathSegments && t.pathSegments.length > 0
        ? t.pathSegments
        : t.fullPath
            .split(/\s*>\s*/)
            .map((s) => s.trim())
            .filter(Boolean);
    const level1Group =
      t.level1Group ?? pathSegments[0] ?? "All tasks";
    return {
      ...t,
      weightagePercent: w,
      taskProgressPercent: tp,
      achievedWeightagePercent: achieved,
      pathSegments,
      level1Group,
    };
  });
}

export function overallCompletionPercent(metrics: TaskWithMetrics[]): number {
  const sum = metrics.reduce((a, m) => a + m.achievedWeightagePercent, 0);
  return Math.min(100, Math.max(0, sum));
}

export function weightageTotal(weightageByTaskId: Record<string, number>): number {
  return Object.values(weightageByTaskId).reduce((a, b) => a + b, 0);
}

export type BottleneckRow = TaskWithMetrics & { riskScore: number };

/** Higher score = more bottleneck: high weight, low progress */
export function computeBottlenecks(
  metrics: TaskWithMetrics[],
  limit = 15
): BottleneckRow[] {
  const withRisk = metrics.map((m) => {
    const p = m.taskProgressPercent / 100;
    const riskScore = m.weightagePercent * (1 - p);
    return { ...m, riskScore };
  });
  return withRisk
    .filter((m) => m.weightagePercent > 0)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, limit);
}
