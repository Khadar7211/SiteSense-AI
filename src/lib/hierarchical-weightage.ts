import type { ParsedTask, RevaParsedRow } from "@/types/progress";

export type WeightTreeNode = {
  id: string;
  taskId: string;
  label: string;
  nodeKind: "parent" | "leaf";
  level: number;
  parentId: string | null;
  children: string[];
};

export type WeightTree = {
  nodes: Record<string, WeightTreeNode>;
  rootIds: string[];
  level1ParentIds: string[];
  leafIds: string[];
};

function splitEqually(total: number, ids: string[]): Record<string, number> {
  const n = ids.length;
  if (n === 0) return {};
  const totalBp = Math.round(total * 100);
  const base = Math.floor(totalBp / n);
  const out: Record<string, number> = {};
  let sum = 0;
  ids.forEach((id, i) => {
    const bp = i === n - 1 ? totalBp - sum : base;
    out[id] = bp / 100;
    sum += bp;
  });
  return out;
}

export function buildWeightTree(rows: RevaParsedRow[], leaves: ParsedTask[]): WeightTree {
  const nodes: Record<string, WeightTreeNode> = {};

  for (const row of rows) {
    if (row.nodeKind !== "parent") continue;
    const id = `p:${row.taskId}`;
    if (nodes[id]) continue;
    nodes[id] = {
      id,
      taskId: row.taskId,
      label: row.taskName,
      nodeKind: "parent",
      level: row.level ?? 1,
      parentId: row.parentTaskId ? `p:${row.parentTaskId}` : null,
      children: [],
    };
  }

  for (const leaf of leaves) {
    const id = leaf.id;
    nodes[id] = {
      id,
      taskId: leaf.taskId,
      label: leaf.name,
      nodeKind: "leaf",
      level: 0,
      parentId: leaf.parentTaskId ? `p:${leaf.parentTaskId}` : null,
      children: [],
    };
  }

  // Fallback for older saved states that only persisted leaves (no parent rows):
  // reconstruct synthetic parent chain from fullPath and connect leaf to deepest parent.
  for (const leaf of leaves) {
    const leafNode = nodes[leaf.id];
    if (!leafNode) continue;
    if (leafNode.parentId && nodes[leafNode.parentId]) continue;

    const segs = leaf.fullPath
      .split(/\s*>\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    const parentSegs = segs.length > 1 ? segs.slice(0, -1) : [];
    let prevParentId: string | null = null;
    parentSegs.forEach((seg, i) => {
      const key = parentSegs.slice(0, i + 1).join(" > ");
      const pid = `p:path:${key}`;
      if (!nodes[pid]) {
        nodes[pid] = {
          id: pid,
          taskId: pid,
          label: seg,
          nodeKind: "parent",
          level: i + 1,
          parentId: prevParentId,
          children: [],
        };
      }
      prevParentId = pid;
    });
    leafNode.parentId = prevParentId;
  }

  const rootIds: string[] = [];
  for (const node of Object.values(nodes)) {
    if (node.parentId && nodes[node.parentId]?.nodeKind === "parent") {
      nodes[node.parentId].children.push(node.id);
      continue;
    }
    rootIds.push(node.id);
  }

  // If hierarchy still has no parent nodes (all roots are leaves),
  // create one synthetic L1 parent so mapping stays parent-first.
  const hasParent = Object.values(nodes).some((n) => n.nodeKind === "parent");
  if (!hasParent) {
    const rootParentId = "p:synthetic:all-tasks";
    nodes[rootParentId] = {
      id: rootParentId,
      taskId: rootParentId,
      label: "All Tasks",
      nodeKind: "parent",
      level: 1,
      parentId: null,
      children: [],
    };
    for (const rid of [...rootIds]) {
      const n = nodes[rid];
      if (!n || n.nodeKind !== "leaf") continue;
      n.parentId = rootParentId;
      nodes[rootParentId].children.push(n.id);
    }
    rootIds.length = 0;
    rootIds.push(rootParentId);
  }

  const level1ParentIds = rootIds.filter((id) => nodes[id]?.nodeKind === "parent");
  const leafIds = Object.values(nodes)
    .filter((n) => n.nodeKind === "leaf")
    .map((n) => n.id);

  return { nodes, rootIds, level1ParentIds, leafIds };
}

export function descendantLeafIds(tree: WeightTree, nodeId: string): string[] {
  const node = tree.nodes[nodeId];
  if (!node) return [];
  if (node.nodeKind === "leaf") return [node.id];
  const out: string[] = [];
  const stack = [...node.children];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const n = tree.nodes[id];
    if (!n) continue;
    if (n.nodeKind === "leaf") out.push(id);
    else stack.push(...n.children);
  }
  return out;
}

export function parentWeight(tree: WeightTree, leafWeights: Record<string, number>, nodeId: string): number {
  const leaves = descendantLeafIds(tree, nodeId);
  return leaves.reduce((a, id) => a + (leafWeights[id] ?? 0), 0);
}

export function immediateChildrenSum(
  tree: WeightTree,
  leafWeights: Record<string, number>,
  nodeId: string
): number {
  const node = tree.nodes[nodeId];
  if (!node || node.nodeKind !== "parent") return 0;
  return node.children.reduce((sum, childId) => {
    const child = tree.nodes[childId];
    if (!child) return sum;
    if (child.nodeKind === "leaf") return sum + (leafWeights[child.id] ?? 0);
    return sum + parentWeight(tree, leafWeights, child.id);
  }, 0);
}

export function immediateLeafChildIds(tree: WeightTree, nodeId: string): string[] {
  const node = tree.nodes[nodeId];
  if (!node || node.nodeKind !== "parent") return [];
  return node.children
    .map((id) => tree.nodes[id])
    .filter((n): n is WeightTreeNode => Boolean(n))
    .filter((n) => n.nodeKind === "leaf")
    .map((n) => n.id);
}

export function distributeToParentDescendants(
  tree: WeightTree,
  leafWeights: Record<string, number>,
  nodeId: string,
  total: number
): Record<string, number> {
  const targetLeaves = immediateLeafChildIds(tree, nodeId);
  if (targetLeaves.length === 0) return leafWeights;
  const split = splitEqually(total, targetLeaves);
  return { ...leafWeights, ...split };
}

export function level1Total(tree: WeightTree, leafWeights: Record<string, number>): number {
  if (tree.level1ParentIds.length > 0) {
    return tree.level1ParentIds.reduce(
      (a, id) => a + parentWeight(tree, leafWeights, id),
      0
    );
  }
  return tree.leafIds.reduce((a, id) => a + (leafWeights[id] ?? 0), 0);
}
