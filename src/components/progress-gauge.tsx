"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

type Props = {
  value: number;
  label?: string;
};

const TRACK = "hsl(214, 32%, 91%)";
const FILL = "hsl(221, 83%, 53%)";

export function ProgressGauge({ value, label = "Overall completion" }: Props) {
  const pct = Math.min(100, Math.max(0, value));
  const data = [
    { name: "done", value: pct },
    { name: "rest", value: Math.max(0, 100 - pct) },
  ];

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-[220px] w-full max-w-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="72%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              strokeWidth={0}
            >
              <Cell key="done" fill={FILL} />
              <Cell key="rest" fill={TRACK} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-semibold tabular-nums text-foreground">
            {pct.toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      </div>
    </div>
  );
}
