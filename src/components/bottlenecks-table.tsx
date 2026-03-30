"use client";

import { Fragment } from "react";

import type { BottleneckRow } from "@/lib/calculations";
import { groupByLevel1Group } from "@/lib/task-groups";
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
  rows: BottleneckRow[];
  /** Group rows under Level 1 headings (PowerPlay hierarchy). */
  groupByLevel1?: boolean;
};

export function BottlenecksTable({ rows, groupByLevel1 }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add weightage to tasks to identify bottlenecks (high weight, low
        progress).
      </p>
    );
  }

  const sections = groupByLevel1
    ? groupByLevel1Group(rows)
    : [{ level1Group: "", items: rows }];

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Task</TableHead>
          <TableHead className="text-right">Weight %</TableHead>
          <TableHead className="text-right">Task progress %</TableHead>
          <TableHead className="text-right">Risk score</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sections.map(({ level1Group, items }) => (
          <Fragment key={level1Group || "flat"}>
            {groupByLevel1 && (
              <TableRow className="border-border/80 bg-muted/30 hover:bg-muted/30">
                <TableCell
                  colSpan={4}
                  className="py-2 text-xs font-semibold uppercase tracking-wide text-primary"
                >
                  {level1Group}
                </TableCell>
              </TableRow>
            )}
            {items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="max-w-[300px]">
                  <div className="font-medium">{r.name}</div>
                  {r.fullPath ? (
                    <div className="truncate text-xs text-muted-foreground">
                      {r.fullPath}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.weightagePercent.toFixed(1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.taskProgressPercent.toFixed(1)}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary" className="tabular-nums">
                    {r.riskScore.toFixed(1)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
