import type { ParsedTask } from "@/types/progress";

/** Equal split summing to exactly 100 (two decimal places). */
export function equalWeightage(tasks: ParsedTask[]): Record<string, number> {
  const n = tasks.length;
  if (n === 0) return {};
  const baseBp = Math.floor(10000 / n);
  const out: Record<string, number> = {};
  let sumBp = 0;
  tasks.forEach((t, i) => {
    const bp = i === n - 1 ? 10000 - sumBp : baseBp;
    out[t.id] = bp / 100;
    sumBp += bp;
  });
  return out;
}

/**
 * Use Weightage (%) from the file when every task has a value; otherwise equal split.
 */
export function initialWeightage(tasks: ParsedTask[]): Record<string, number> {
  if (tasks.length === 0) return {};
  const allHave = tasks.every(
    (t) => t.weightageFromFile != null && Number.isFinite(t.weightageFromFile)
  );
  if (allHave) {
    return Object.fromEntries(
      tasks.map((t) => [t.id, t.weightageFromFile as number])
    );
  }
  return equalWeightage(tasks);
}
