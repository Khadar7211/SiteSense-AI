"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { RevaParsedRow, TaskWithMetrics } from "@/types/progress";

type DashboardRow = {
  key: string;
  nodeKind: "parent" | "leaf";
  taskId: string;
  label: string;
  depth: number;
  target: number;
  achieved: number;
  progress: number;
  idx: number;
  parentIdx: number | null;
};

type FlatNode = {
  idx: number;
  taskId: string;
  label: string;
  nodeKind: "parent" | "leaf";
  level: number | null;
  parentTaskId: string | null;
  children: number[];
};

function buildRows(
  rows: RevaParsedRow[],
  metrics: TaskWithMetrics[]
): DashboardRow[] {
  if (rows.length === 0) return [];

  const leafAgg = new Map<string, { target: number; achieved: number }>();
  for (const m of metrics) {
    const prev = leafAgg.get(m.taskId) ?? { target: 0, achieved: 0 };
    prev.target += m.weightagePercent;
    prev.achieved += m.achievedWeightagePercent;
    leafAgg.set(m.taskId, prev);
  }

  const nodes: FlatNode[] = rows.map((r, idx) => ({
    idx,
    taskId: r.taskId,
    label: r.taskName || r.taskId,
    nodeKind: r.nodeKind,
    level: r.level ?? null,
    parentTaskId: r.parentTaskId,
    children: [],
  }));

  const parentIndexByTask = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    if (!parentIndexByTask.has(n.taskId)) parentIndexByTask.set(n.taskId, []);
    parentIndexByTask.get(n.taskId)!.push(i);
  });

  const resolveParentIndex = (node: FlatNode): number | null => {
    const explicit = node.parentTaskId;
    if (explicit) {
      const arr = parentIndexByTask.get(explicit) ?? [];
      for (let j = arr.length - 1; j >= 0; j--) {
        if (arr[j]! < node.idx) return arr[j]!;
      }
    }
    if (node.level != null && node.level > 1) {
      for (let i = node.idx - 1; i >= 0; i--) {
        const cand = nodes[i]!;
        if (cand.nodeKind !== "parent") continue;
        if (cand.level != null && cand.level < node.level) return i;
      }
    }
    if (node.nodeKind === "leaf") {
      for (let i = node.idx - 1; i >= 0; i--) {
        if (nodes[i]!.nodeKind === "parent") return i;
      }
    }
    return null;
  };

  for (const node of nodes) {
    const p = resolveParentIndex(node);
    if (p != null) nodes[p]!.children.push(node.idx);
  }
  const parentByIdx = new Map<number, number | null>();
  for (const n of nodes) parentByIdx.set(n.idx, resolveParentIndex(n));

  const targetByIdx = new Map<number, number>();
  const achievedByIdx = new Map<number, number>();

  const dfs = (idx: number): { target: number; achieved: number } => {
    const n = nodes[idx]!;
    if (n.nodeKind === "leaf") {
      const agg = leafAgg.get(n.taskId) ?? { target: 0, achieved: 0 };
      targetByIdx.set(idx, agg.target);
      achievedByIdx.set(idx, agg.achieved);
      return agg;
    }
    let target = 0;
    let achieved = 0;
    for (const cIdx of n.children) {
      const c = dfs(cIdx);
      target += c.target;
      achieved += c.achieved;
    }
    targetByIdx.set(idx, target);
    achievedByIdx.set(idx, achieved);
    return { target, achieved };
  };

  for (let i = 0; i < nodes.length; i++) {
    const hasParentAbove = nodes.some((x) => x.children.includes(i));
    if (!hasParentAbove) dfs(i);
  }

  // Compute display depth by parent-links we resolved.
  const depthByIdx = new Map<number, number>();
  const getDepth = (idx: number): number => {
    const existing = depthByIdx.get(idx);
    if (existing != null) return existing;
    const parent = nodes.findIndex((n) => n.children.includes(idx));
    const depth = parent < 0 ? 1 : getDepth(parent) + 1;
    depthByIdx.set(idx, depth);
    return depth;
  };

  return nodes.map((n, idx) => {
    const target = targetByIdx.get(idx) ?? 0;
    const achieved = achievedByIdx.get(idx) ?? 0;
    return {
      key: `${n.taskId}__${idx}`,
      nodeKind: n.nodeKind,
      taskId: n.taskId,
      label: n.label,
      depth: getDepth(idx),
      target,
      achieved,
      progress: target > 0 ? (achieved / target) * 100 : 0,
      idx,
      parentIdx: parentByIdx.get(idx) ?? null,
    };
  });
}

function collectLeafChildren(items: DashboardRow[], parent: DashboardRow): DashboardRow[] {
  const byIdx = new Map(items.map((r) => [r.idx, r]));
  const isDescendant = (child: DashboardRow): boolean => {
    let cur = child.parentIdx;
    while (cur != null) {
      if (cur === parent.idx) return true;
      cur = byIdx.get(cur)?.parentIdx ?? null;
    }
    return false;
  };
  return items.filter((r) => r.nodeKind === "leaf" && isDescendant(r));
}

export function ParentLevelDashboard({
  rows,
  metrics,
}: {
  rows: RevaParsedRow[];
  metrics: TaskWithMetrics[];
}) {
  const items = useMemo(() => buildRows(rows, metrics), [rows, metrics]);
  const [openParents, setOpenParents] = useState<Set<string>>(new Set());
  const parents = items.filter((i) => i.nodeKind === "parent");
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No rows available for this dataset.
      </p>
    );
  }

  return (
    <Card className="border-border">
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-12" />
              <TableHead className="w-28">Task ID</TableHead>
              <TableHead className="min-w-[260px]">Parent Task</TableHead>
              <TableHead className="w-32 text-right">Target %</TableHead>
              <TableHead className="w-36 text-right">Achieved %</TableHead>
              <TableHead className="w-[260px]">Progress</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parents.map((r) => {
              const p = Math.min(100, Math.max(0, r.progress));
              const leafChildren = collectLeafChildren(items, r);
              const isOpen = openParents.has(r.key);
              return (
                <Fragment key={r.key}>
                  <TableRow key={r.key}>
                    <TableCell>
                      <button
                        type="button"
                        className="rounded p-1 transition hover:bg-muted"
                        onClick={() => {
                          setOpenParents((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.key)) next.delete(r.key);
                            else next.add(r.key);
                            return next;
                          });
                        }}
                        aria-label={`Toggle ${r.label} leaf tasks`}
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-primary" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-primary" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.taskId}
                    </TableCell>
                    <TableCell>
                      <div
                        className={cn("font-semibold text-foreground")}
                        style={{ paddingLeft: Math.max(0, (r.depth - 1) * 14) }}
                      >
                        {r.label}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.target.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.achieved.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={p} className="h-2.5" />
                        <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
                          {p.toFixed(1)}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isOpen &&
                    leafChildren.map((leaf) => {
                      const lp = Math.min(100, Math.max(0, leaf.progress));
                      return (
                        <TableRow
                          key={`${r.key}::leaf::${leaf.key}`}
                          className="bg-muted/30"
                        >
                          <TableCell />
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {leaf.taskId}
                          </TableCell>
                          <TableCell>
                            <div
                              className="text-sm text-muted-foreground"
                              style={{ paddingLeft: Math.max(0, leaf.depth * 14) }}
                            >
                              {leaf.label}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {leaf.target.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {leaf.achieved.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={lp} className="h-2" />
                              <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
                                {lp.toFixed(1)}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
