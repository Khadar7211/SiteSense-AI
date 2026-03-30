"use client";

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

export type SnapshotPoint = {
  date: string;
  cumulative: number;
  period: string;
};

type ChartRow = SnapshotPoint & {
  label: string;
  planned: number;
};

function buildChartRows(data: SnapshotPoint[]): ChartRow[] {
  const sorted = [...data].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  if (sorted.length === 0) return [];

  const t0 = new Date(sorted[0]!.date).getTime();
  const tLast = new Date(sorted[sorted.length - 1]!.date).getTime();
  const span = Math.max(1, tLast - t0);

  return sorted.map((d) => {
    const t = new Date(d.date).getTime();
    const planned =
      sorted.length === 1 ? 0 : ((t - t0) / span) * 100;
    return {
      ...d,
      planned: Math.min(100, Math.max(0, planned)),
      label: new Date(d.date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
    };
  });
}

type Props = {
  data: SnapshotPoint[];
};

export function SCurveChart({ data }: Props) {
  const chartData = buildChartRows(data);

  if (chartData.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 text-center text-sm text-muted-foreground">
        Save snapshots over time to see actual vs reference progress. Use
        &quot;Save snapshot&quot; after each progress update.
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "hsl(215, 16%, 47%)" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11, fill: "hsl(215, 16%, 47%)" }}
            width={44}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(0, 0%, 100%)",
              border: "1px solid hsl(214, 32%, 91%)",
              borderRadius: "8px",
              color: "hsl(222, 47%, 11%)",
            }}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as ChartRow | undefined;
              return p ? new Date(p.date).toLocaleString() : "";
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="planned"
            name="Reference (time-linear)"
            stroke="hsl(215, 16%, 65%)"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="cumulative"
            name="Actual cumulative"
            stroke="hsl(221, 83%, 53%)"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
