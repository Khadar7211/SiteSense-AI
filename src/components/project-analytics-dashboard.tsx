"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ParsedTask } from "@/types/progress";

type ActualPoint = { date: string; value: number };
type Row = {
  date: string;
  label: string;
  planned: number;
  actual: number | null;
  forecast: number | null;
};

function dayKey(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

function eachDay(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= last) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function buildPlanned(leaves: ParsedTask[], weightage: Record<string, number>) {
  const daily = new Map<string, number>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (const leaf of leaves) {
    const w = weightage[leaf.id] ?? 0;
    if (w <= 0) continue;
    const s = leaf.startDate ? new Date(leaf.startDate) : null;
    const e = leaf.endDate ? new Date(leaf.endDate) : null;
    if (!s || !e || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
    const start = s <= e ? s : e;
    const end = s <= e ? e : s;
    if (!minDate || start < minDate) minDate = start;
    if (!maxDate || end > maxDate) maxDate = end;
    const days = eachDay(start, end);
    const dailyVal = w / Math.max(1, days.length);
    for (const d of days) {
      const k = dayKey(d);
      daily.set(k, (daily.get(k) ?? 0) + dailyVal);
    }
  }

  return { daily, minDate, maxDate };
}

function normalizeActual(actual: ActualPoint[]): ActualPoint[] {
  const sorted = [...actual].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  let run = 0;
  return sorted.map((p) => {
    run = Math.min(100, Math.max(0, run + Number(p.value || 0)));
    return { date: p.date, value: run };
  });
}

export function ProjectAnalyticsDashboard({
  leaves,
  weightage,
  actualLogs,
}: {
  leaves: ParsedTask[];
  weightage: Record<string, number>;
  actualLogs: ActualPoint[];
}) {
  const { chartRows, scheduleVariance, projectedFinish, velocityPerWeek } = useMemo(() => {
    const planned = buildPlanned(leaves, weightage);
    const actual = normalizeActual(actualLogs);
    const today = new Date();
    const start =
      planned.minDate ??
      (actual[0] ? new Date(actual[0].date) : new Date(today.getTime() - 14 * 86400000));
    const end =
      planned.maxDate ??
      (actual.at(-1) ? new Date(actual.at(-1)!.date) : new Date(today.getTime() + 60 * 86400000));

    const points = eachDay(start, end);
    const actualByDay = new Map(
      actual.map((a) => [dayKey(new Date(a.date)), a.value] as const)
    );

    const rows: Row[] = [];
    let plannedCum = 0;
    let actualCarry: number | null = null;
    for (const d of points) {
      const k = dayKey(d);
      plannedCum = Math.min(100, plannedCum + (planned.daily.get(k) ?? 0));
      if (actualByDay.has(k)) actualCarry = actualByDay.get(k)!;
      rows.push({
        date: k,
        label: new Date(k).toLocaleDateString(undefined, {
          month: "short",
          day: "2-digit",
        }),
        planned: plannedCum,
        actual: actualCarry,
        forecast: null,
      });
    }

    const lastActualIdx = [...rows].reverse().findIndex((r) => r.actual != null);
    const idx = lastActualIdx >= 0 ? rows.length - 1 - lastActualIdx : -1;
    const plannedAtLast = idx >= 0 ? rows[idx]!.planned : 0;
    const actualAtLast = idx >= 0 ? rows[idx]!.actual ?? 0 : 0;
    const sv = actualAtLast - plannedAtLast;

    let velocity = 0;
    if (actual.length >= 2) {
      const first = actual[0]!;
      const last = actual.at(-1)!;
      const weeks = Math.max(
        1 / 7,
        (new Date(last.date).getTime() - new Date(first.date).getTime()) / (7 * 86400000)
      );
      velocity = Math.max(0, (last.value - first.value) / weeks);
    }

    let finishDate: string | null = null;
    if (idx >= 0 && velocity > 0 && actualAtLast < 100) {
      const remaining = 100 - actualAtLast;
      const weeksToFinish = remaining / velocity;
      const daysToFinish = Math.ceil(weeksToFinish * 7);
      const d = new Date(rows[idx]!.date);
      d.setDate(d.getDate() + daysToFinish);
      finishDate = d.toISOString();

      if (actualAtLast < plannedAtLast) {
        let fc = actualAtLast;
        for (let i = idx + 1; i < rows.length; i++) {
          fc = Math.min(100, fc + velocity / 7);
          rows[i]!.forecast = fc;
        }
      }
    }

    return {
      chartRows: rows,
      scheduleVariance: sv,
      projectedFinish: finishDate,
      velocityPerWeek: velocity,
    };
  }, [leaves, weightage, actualLogs]);

  if (chartRows.length === 0) {
    return <p className="text-sm text-muted-foreground">No analytics data available yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Schedule Variance (SV)</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={
                scheduleVariance < 0
                  ? "text-lg font-semibold text-red-600"
                  : "text-lg font-semibold text-emerald-600"
              }
            >
              {scheduleVariance.toFixed(2)}%
            </p>
            <p className={scheduleVariance < 0 ? "text-xs text-red-600" : "text-xs text-emerald-600"}>
              {scheduleVariance < 0 ? "BEHIND SCHEDULE" : "ON / AHEAD OF SCHEDULE"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Velocity (avg/week)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold text-primary">{velocityPerWeek.toFixed(2)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Completion Date Estimate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold text-primary">
              {projectedFinish
                ? new Date(projectedFinish).toLocaleDateString()
                : "Insufficient data"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="h-[380px] p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                formatter={(value) =>
                  value == null
                    ? ["—", ""]
                    : [`${Number(value as number).toFixed(2)}%`, ""]
                }
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="planned"
                name="Planned Progress"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual Progress"
                stroke="#16a34a"
                strokeWidth={2.5}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="forecast"
                name="Forecast"
                stroke="#dc2626"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
