"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { type WeightTree, parentWeight } from "@/lib/hierarchical-weightage";
import { cn, toDomId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = {
  tree: WeightTree;
  leafWeights: Record<string, number>;
  onLeafChange: (leafNodeId: string, raw: string) => void;
  onParentChange: (parentNodeId: string, raw: string) => void;
  onDistributeEqual: (parentNodeId: string) => void;
  highlightedTaskIds?: Set<string>;
};

export function HierarchicalWeightageTree({
  tree,
  leafWeights,
  onLeafChange,
  onParentChange,
  onDistributeEqual,
  highlightedTaskIds,
}: Props) {
  const defaultOpen = useMemo(
    () => new Set(tree.level1ParentIds.length ? tree.level1ParentIds : tree.rootIds),
    [tree.level1ParentIds, tree.rootIds]
  );
  const [openParents, setOpenParents] = useState<Set<string>>(defaultOpen);
  const [parentDrafts, setParentDrafts] = useState<Record<string, string>>({});

  const toggle = (id: string) => {
    setOpenParents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderRows = (nodeId: string, depth: number) => {
    const node = tree.nodes[nodeId];
    if (!node) return [];

    if (node.nodeKind === "leaf") {
      const v = leafWeights[node.id] ?? 0;
      const isNew = highlightedTaskIds?.has(node.taskId) ?? false;
      return [
        <TableRow
          key={`leaf:${node.id}`}
          className={cn("bg-muted/30", isNew && "bg-amber-50/70")}
        >
          <TableCell />
          <TableCell className="font-mono text-xs text-muted-foreground">
            {node.taskId}
          </TableCell>
          <TableCell>
            <div
              className="text-sm text-muted-foreground"
              style={{ paddingLeft: Math.max(0, depth * 14) }}
            >
              {node.label}
            </div>
          </TableCell>
          <TableCell className="text-right">
            <Input
              id={toDomId(node.id, "wt")}
              type="number"
              step="0.01"
              min={0}
              className="h-8 text-right"
              value={v}
              onChange={(e) => onLeafChange(node.id, e.target.value)}
            />
          </TableCell>
          <TableCell />
        </TableRow>,
      ];
    }

    const v = parentWeight(tree, leafWeights, node.id);
    const draft = parentDrafts[node.id];
    const parentInputValue = draft != null ? draft : String(Number(v.toFixed(2)));
    const isOpen = openParents.has(node.id);
    const out = [
      <TableRow
        key={`parent:${node.id}`}
        className={cn(node.level <= 1 ? "bg-blue-50/80" : "bg-slate-50/80")}
      >
        <TableCell>
          <button
            type="button"
            className="rounded p-1 transition hover:bg-muted"
            onClick={() => toggle(node.id)}
            aria-label={`Toggle ${node.label} children`}
          >
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-primary" />
            ) : (
              <ChevronRight className="h-4 w-4 text-primary" />
            )}
          </button>
        </TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">
          {node.taskId}
        </TableCell>
        <TableCell>
          <div
            className="font-semibold text-foreground"
            style={{ paddingLeft: Math.max(0, depth * 14) }}
          >
            {node.label}
          </div>
        </TableCell>
        <TableCell className="text-right">
          <Input
            id={toDomId(node.id, "wt")}
            type="number"
            step="0.01"
            min={0}
            className="h-8 text-right"
            value={parentInputValue}
            onChange={(e) => {
              const raw = e.target.value;
              setParentDrafts((prev) => ({ ...prev, [node.id]: raw }));
              if (raw === "" || raw.endsWith(".")) return;
              onParentChange(node.id, raw);
            }}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              onParentChange(node.id, raw === "" ? "0" : raw);
              setParentDrafts((prev) => {
                const next = { ...prev };
                delete next[node.id];
                return next;
              });
            }}
          />
        </TableCell>
        <TableCell className="text-right">
          <Button
            type="button"
            variant="outline"
            className="h-8"
            onClick={() => onDistributeEqual(node.id)}
          >
            Distribute equally
          </Button>
        </TableCell>
      </TableRow>,
    ];

    if (isOpen) {
      for (const childId of node.children) {
        out.push(...renderRows(childId, depth + 1));
      }
    }

    return out;
  };

  if (tree.rootIds.length === 0) return null;

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="w-12" />
          <TableHead className="w-28">Task ID</TableHead>
          <TableHead className="min-w-[260px]">Task</TableHead>
          <TableHead className="w-36 text-right">Weightage %</TableHead>
          <TableHead className="w-40 text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tree.rootIds.map((rootId) => (
          <Fragment key={`root:${rootId}`}>
            {renderRows(rootId, 0)}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
