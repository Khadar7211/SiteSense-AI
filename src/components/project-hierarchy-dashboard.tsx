"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RollupTreeNode } from "@/types/progress";

type Props = {
  root: RollupTreeNode;
  totalProjectPct: number;
  weightOk: boolean;
};

function ParentProgress({
  value,
  thick,
}: {
  value: number;
  thick?: boolean;
}) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div className="flex min-w-[140px] max-w-[220px] items-center gap-2">
      <Progress
        value={v}
        className={cn("flex-1", thick ? "h-3.5" : "h-2")}
      />
      <span
        className={cn(
          "w-14 shrink-0 text-right tabular-nums text-muted-foreground",
          thick && "font-bold text-foreground"
        )}
      >
        {v.toFixed(1)}%
      </span>
    </div>
  );
}

function LeafRow({
  node,
  depth,
}: {
  node: RollupTreeNode;
  depth: number;
}) {
  const m = node.leaf!;
  return (
    <TableRow
      className="bg-muted/25 hover:bg-muted/35"
      style={{ boxShadow: `inset ${8 + depth * 12}px 0 0 0 hsl(var(--border) / 0.35)` }}
    >
      <TableCell className="min-w-[180px]">
        <p className="font-medium">{m.name}</p>
        <p className="line-clamp-1 text-xs text-muted-foreground">{m.fullPath}</p>
      </TableCell>
      <TableCell className="w-16 text-muted-foreground">{m.unit || "—"}</TableCell>
      <TableCell className="w-32 text-right tabular-nums text-sm">
        {m.actualQty} / {m.totalQty}
      </TableCell>
      <TableCell className="w-28 text-right tabular-nums">
        {m.weightagePercent.toFixed(1)}%
      </TableCell>
      <TableCell className="w-[200px]">
        <ParentProgress value={m.taskProgressPercent} />
      </TableCell>
    </TableRow>
  );
}

function BranchRows({
  node,
  depth,
}: {
  node: RollupTreeNode;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 3);

  if (node.isLeaf && node.leaf) {
    return <LeafRow node={node} depth={depth} />;
  }

  if (node.children.length === 0) return null;

  const thickBar = depth <= 2;
  const boldParent = depth <= 2;

  return (
    <>
      <TableRow
        className={cn(
          "border-b-2 border-border bg-slate-200/95",
          boldParent && "font-bold"
        )}
      >
        <TableCell colSpan={5} className="p-0">
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger
              className={cn(
                "flex w-full items-center gap-2 px-3 py-3 text-left",
                boldParent && "text-base"
              )}
              style={{ paddingLeft: 12 + depth * 14 }}
            >
              {open ? (
                <ChevronDown className="h-5 w-5 shrink-0 text-primary" />
              ) : (
                <ChevronRight className="h-5 w-5 shrink-0 text-primary" />
              )}
              <span className="min-w-0 flex-1 truncate">{node.label}</span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                Σ target {node.targetWeightSum.toFixed(1)}%
              </span>
              <div className="hidden sm:block">
                <ParentProgress
                  value={node.rollupProgressPct}
                  thick={thickBar}
                />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="pb-0">
              <Table className="border-0">
                <TableBody className="border-0">
                  {node.children.map((ch) => (
                    <BranchRows key={ch.pathKey} node={ch} depth={depth + 1} />
                  ))}
                </TableBody>
              </Table>
            </CollapsibleContent>
          </Collapsible>
        </TableCell>
      </TableRow>
    </>
  );
}

export function ProjectHierarchyDashboard({
  root,
  totalProjectPct,
  weightOk,
}: Props) {
  const display = Math.min(100, Math.max(0, totalProjectPct));

  if (root.children.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hierarchy data. Upload a Reva extract (row 2 headers, WBS paths via
        Task Names / Parent–Leaf).
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-2 border-primary/30 bg-primary/5 shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-6">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Total project completion
            </p>
            {!weightOk && (
              <p className="mt-1 text-xs text-amber-700">
                Set target weights to 100% for accurate rollups.
              </p>
            )}
          </div>
          <p className="text-4xl font-bold tabular-nums tracking-tight text-primary">
            {display.toFixed(2)}%
          </p>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="min-w-[200px]">Name / WBS</TableHead>
              <TableHead className="w-20">Unit</TableHead>
              <TableHead className="w-32 text-right">Actual / Total</TableHead>
              <TableHead className="w-28 text-right">Target %</TableHead>
              <TableHead className="w-[220px]">Rolled-up %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {root.children.map((ch) => (
              <BranchRows key={ch.pathKey} node={ch} depth={0} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
