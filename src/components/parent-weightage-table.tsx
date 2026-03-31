"use client";

import type { MajorParentBucket } from "@/lib/parent-weight-buckets";
import { cn, toDomId } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Props = {
  buckets: MajorParentBucket[];
  parentWeight: Record<string, number>;
  onParentWeightChange: (key: string, raw: string) => void;
  highlightedParentKeys?: Set<string>;
};

export function ParentWeightageTable({
  buckets,
  parentWeight,
  onParentWeightChange,
  highlightedParentKeys,
}: Props) {
  if (buckets.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="min-w-[200px]">Major parent (WBS)</TableHead>
            <TableHead className="w-24">Tier</TableHead>
            <TableHead className="w-36 text-right">Target weight %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {buckets.map((b) => {
            const wid = toDomId(b.key, "pw");
            const v = parentWeight[b.key];
            const n = v != null && Number.isFinite(v) ? v : 0;
            const count = b.leafIds.length;
            const each = count > 0 ? n / count : 0;
            const isNew = highlightedParentKeys?.has(b.key) ?? false;
            return (
              <TableRow
                key={b.key}
                className={cn(
                  "bg-background",
                  isNew && "border-l-4 border-l-amber-500 bg-amber-50/60"
                )}
              >
                <TableCell className="align-top">
                  <div className="font-medium">{b.displayLabel}</div>
                  {isNew ? (
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                      Contains new tasks
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Distributing to {count} task{count === 1 ? "" : "s"} at{" "}
                    {each.toFixed(2)}% each.
                  </p>
                </TableCell>
                <TableCell className="align-top">
                  <Badge variant="secondary" className="font-normal">
                    Level {b.tier}
                  </Badge>
                </TableCell>
                <TableCell className="align-top">
                  <Input
                    id={wid}
                    type="number"
                    step="0.01"
                    min={0}
                    className="h-9 w-full max-w-[120px] text-right"
                    value={v ?? ""}
                    onChange={(e) => onParentWeightChange(b.key, e.target.value)}
                    aria-label={`Target weight for ${b.displayLabel}`}
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
