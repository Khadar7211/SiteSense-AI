"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import {
  type WeightTree,
  immediateChildrenSum,
  parentWeight,
} from "@/lib/hierarchical-weightage";
import { cn, toDomId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  tree: WeightTree;
  leafWeights: Record<string, number>;
  onParentChange: (parentNodeId: string, raw: string) => void;
  onDistributeEqual: (parentNodeId: string) => void;
  highlightedTaskIds?: Set<string>;
};

export function HierarchicalWeightageTree({
  tree,
  leafWeights,
  onParentChange,
  onDistributeEqual,
  highlightedTaskIds,
}: Props) {
  const defaultOpen = useMemo(
    () => new Set(tree.level1ParentIds.length ? tree.level1ParentIds : tree.rootIds),
    [tree.level1ParentIds, tree.rootIds]
  );
  const [open, setOpen] = useState<Set<string>>(defaultOpen);

  const toggle = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNode = (id: string, depth: number) => {
    const node = tree.nodes[id];
    if (!node) return null;

    if (node.nodeKind === "leaf") {
      const v = leafWeights[node.id] ?? 0;
      const isNew = highlightedTaskIds?.has(node.taskId) ?? false;
      return (
        <div
          key={id}
          className={cn(
            "grid grid-cols-[1fr,140px] items-center gap-3 rounded-md border px-2 py-2",
            isNew && "border-amber-300 bg-amber-50/70"
          )}
          style={{ marginLeft: depth * 18 }}
        >
          <div className="min-w-0">
            <p className="truncate text-sm">{node.label}</p>
            <p className="text-xs text-muted-foreground">
              Leaf (auto-distributed)
            </p>
          </div>
          <p className="text-right text-sm font-medium tabular-nums">
            {v.toFixed(2)}%
          </p>
        </div>
      );
    }

    const v = parentWeight(tree, leafWeights, node.id);
    const childrenSum = immediateChildrenSum(tree, leafWeights, node.id);
    const mismatch = Math.abs(childrenSum - v) > 0.01;
    const isOpen = open.has(node.id);

    return (
      <div key={id} className="space-y-2">
        <div
          className="grid grid-cols-[1fr,140px,120px] items-center gap-3 rounded-md border bg-muted/20 px-2 py-2"
          style={{ marginLeft: depth * 18 }}
        >
          <button
            type="button"
            className="flex items-center gap-1 text-left"
            onClick={() => toggle(node.id)}
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="truncate font-medium">{node.label}</span>
          </button>
          <Input
            id={toDomId(node.id, "wt")}
            type="number"
            step="0.01"
            min={0}
            className={cn("h-8 text-right", mismatch && "border-red-500 ring-1 ring-red-200")}
            value={Number.isFinite(v) ? Number(v.toFixed(2)) : 0}
            onChange={(e) => onParentChange(node.id, e.target.value)}
          />
          <Button type="button" variant="outline" className="h-8" onClick={() => onDistributeEqual(node.id)}>
            Distribute equally
          </Button>
        </div>
        {isOpen ? (
          <div className="space-y-2">
            {node.children.map((cid) => renderNode(cid, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  if (tree.rootIds.length === 0) return null;

  return <div className="space-y-2">{tree.rootIds.map((id) => renderNode(id, 0))}</div>;
}
