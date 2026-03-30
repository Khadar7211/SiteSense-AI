"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { toDomId } from "@/lib/utils";
import type { ParsedTask } from "@/types/progress";

type Props = {
  tasks: ParsedTask[];
  weightage: Record<string, number>;
  onWeightChange: (id: string, raw: string) => void;
  /** Highlight rows whose Task ID is in this set (e.g. newly detected tasks). */
  highlightedTaskIds?: Set<string>;
};

export function LeafWeightageTable({
  tasks,
  weightage,
  onWeightChange,
  highlightedTaskIds,
}: Props) {
  if (tasks.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-28 shrink-0 font-mono text-xs">
              Task ID
            </TableHead>
            <TableHead className="min-w-[200px]">Work item</TableHead>
            <TableHead className="hidden md:table-cell min-w-[240px]">
              Full WBS path
            </TableHead>
            <TableHead className="w-20">Unit</TableHead>
            <TableHead className="w-28 text-right">Qty (Act / Tot)</TableHead>
            <TableHead className="w-32 text-right">Target weight %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((t) => {
            const wid = toDomId(t.id, "tw");
            const isNew = highlightedTaskIds?.has(t.taskId) ?? false;
            return (
              <TableRow
                key={t.id}
                className={
                  isNew
                    ? "border-l-4 border-l-amber-500 bg-amber-50/60"
                    : "bg-background"
                }
              >
                <TableCell className="align-middle font-mono text-xs text-muted-foreground">
                  {t.taskId}
                </TableCell>
                <TableCell className="align-middle font-medium">
                  {t.name}
                </TableCell>
                <TableCell className="hidden max-w-[320px] align-middle text-xs text-muted-foreground md:table-cell">
                  <span className="line-clamp-2">{t.fullPath}</span>
                </TableCell>
                <TableCell className="align-middle text-muted-foreground">
                  {t.unit || "—"}
                </TableCell>
                <TableCell className="align-middle text-right tabular-nums text-sm">
                  {t.actualQty} / {t.totalQty}
                </TableCell>
                <TableCell className="align-middle">
                  <Input
                    id={wid}
                    type="number"
                    step="0.01"
                    min={0}
                    className="h-9 w-full max-w-[120px] text-right"
                    value={weightage[t.id] ?? ""}
                    onChange={(e) => onWeightChange(t.id, e.target.value)}
                    aria-label={`Target weight for ${t.name}`}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
