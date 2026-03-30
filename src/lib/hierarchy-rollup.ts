import type { RollupTreeNode, TaskWithMetrics } from "@/types/progress";

/**
 * Build a WBS tree from leaf path segments and compute parent rollups:
 * target = sum of child targets, achieved = sum of child achieved,
 * progress % = achieved/target * 100.
 */
export function buildRollupTree(metrics: TaskWithMetrics[]): RollupTreeNode {
  const root: RollupTreeNode = {
    pathKey: "",
    label: "Project",
    taskId: "",
    depth: 0,
    isLeaf: false,
    children: [],
    targetWeightSum: 0,
    achievedWeightSum: 0,
    rollupProgressPct: 0,
  };

  for (const m of metrics) {
    if (!m.pathSegments?.length) continue;
    insertLeaf(root, m.pathSegments, m);
  }

  sortTree(root);
  computeRollups(root);
  return root;
}

function sortTree(node: RollupTreeNode): void {
  node.children.sort((a, b) => a.label.localeCompare(b.label));
  for (const c of node.children) {
    sortTree(c);
  }
}

function insertLeaf(
  parent: RollupTreeNode,
  segments: string[],
  metrics: TaskWithMetrics
): void {
  if (segments.length === 0) return;

  if (segments.length === 1) {
    const label = segments[0]!;
    const pathPrefix = parent.pathKey ? `${parent.pathKey} > ${label}` : label;
    parent.children.push({
      // Keep keys unique even when sibling leaf labels repeat.
      pathKey: `${pathPrefix}::__leaf__${metrics.id}`,
      label,
      taskId: metrics.id,
      depth: parent.depth + 1,
      isLeaf: true,
      children: [],
      leaf: metrics,
      targetWeightSum: metrics.weightagePercent,
      achievedWeightSum: metrics.achievedWeightagePercent,
      rollupProgressPct: metrics.taskProgressPercent,
    });
    return;
  }

  const [head, ...rest] = segments;
  const pathPrefix = parent.pathKey ? `${parent.pathKey} > ${head!}` : head!;
  let child = parent.children.find((c) => c.pathKey === pathPrefix);
  if (!child) {
    child = {
      pathKey: pathPrefix,
      label: head!,
      taskId: "",
      depth: parent.depth + 1,
      isLeaf: false,
      children: [],
      targetWeightSum: 0,
      achievedWeightSum: 0,
      rollupProgressPct: 0,
    };
    parent.children.push(child);
  }
  insertLeaf(child, rest, metrics);
}

function computeRollups(node: RollupTreeNode): void {
  if (node.isLeaf && node.leaf) {
    node.targetWeightSum = node.leaf.weightagePercent;
    node.achievedWeightSum = node.leaf.achievedWeightagePercent;
    node.rollupProgressPct = node.leaf.taskProgressPercent;
    return;
  }

  for (const c of node.children) {
    computeRollups(c);
  }

  node.targetWeightSum = node.children.reduce((a, c) => a + c.targetWeightSum, 0);
  node.achievedWeightSum = node.children.reduce((a, c) => a + c.achievedWeightSum, 0);
  node.rollupProgressPct =
    node.targetWeightSum > 1e-9
      ? (node.achievedWeightSum / node.targetWeightSum) * 100
      : 0;
}

export function totalProjectCompletion(metrics: TaskWithMetrics[]): number {
  return metrics.reduce((a, m) => a + m.achievedWeightagePercent, 0);
}
