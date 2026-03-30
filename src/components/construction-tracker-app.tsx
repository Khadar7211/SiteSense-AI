"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  FolderTree,
  Loader2,
  Save,
  Scale,
  Upload,
} from "lucide-react";

import { BottlenecksTable } from "@/components/bottlenecks-table";
import { ProgressGauge } from "@/components/progress-gauge";
import { LeafWeightageTable } from "@/components/leaf-weightage-table";
import { ProjectHierarchyDashboard } from "@/components/project-hierarchy-dashboard";
import { SCurveChart, type SnapshotPoint } from "@/components/scurve-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildTaskMetrics,
  computeBottlenecks,
  overallCompletionPercent,
  weightageTotal,
} from "@/lib/calculations";
import { parsePowerPlayCsv, parsePowerPlayXlsx } from "@/lib/csv-parser";
import { buildRollupTree } from "@/lib/hierarchy-rollup";
import { equalWeightage, initialWeightage } from "@/lib/weightage-init";
import type { ParsedTask } from "@/types/progress";

export function ConstructionTrackerApp() {
  const [tasks, setTasks] = useState<ParsedTask[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [weightage, setWeightage] = useState<Record<string, number>>({});
  const [snapshotPeriod, setSnapshotPeriod] = useState<"daily" | "weekly">(
    "daily"
  );
  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [history, setHistory] = useState<SnapshotPoint[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/snapshots");
      const json = await res.json();
      const rows = json.snapshots as
        | {
            created_at: string;
            cumulative_achieved_weightage: number;
            snapshot_period: string;
          }[]
        | undefined;
      if (rows?.length) {
        setHistory(
          rows.map((r) => ({
            date: r.created_at,
            cumulative: Number(r.cumulative_achieved_weightage),
            period: r.snapshot_period,
          }))
        );
      } else {
        setHistory([]);
      }
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (tasks.length === 0) return;
    let cancelled = false;
    void fetch("/api/task-settings")
      .then((r) => r.json())
      .then((j: { settings?: Record<string, number> }) => {
        if (cancelled) return;
        const s = j.settings;
        if (!s) return;
        setWeightage(() => {
          const base = initialWeightage(tasks);
          for (const t of tasks) {
            const v = s[t.fullPath];
            if (v != null && Number.isFinite(v)) base[t.id] = v;
          }
          return base;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [tasks]);

  const weightSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (tasks.length === 0) return;
    if (weightSaveTimer.current) clearTimeout(weightSaveTimer.current);
    weightSaveTimer.current = setTimeout(() => {
      void fetch("/api/task-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: Object.fromEntries(
            tasks.map((task) => [task.fullPath, weightage[task.id] ?? 0])
          ),
        }),
      });
    }, 800);
    return () => {
      if (weightSaveTimer.current) clearTimeout(weightSaveTimer.current);
    };
  }, [tasks, weightage]);

  const metrics = useMemo(
    () => buildTaskMetrics(tasks, weightage),
    [tasks, weightage]
  );

  const overall = overallCompletionPercent(metrics);
  const totalW = weightageTotal(weightage);
  const weightOk = tasks.length === 0 || Math.abs(totalW - 100) < 0.01;
  const bottlenecks = useMemo(() => computeBottlenecks(metrics), [metrics]);

  const rollupRoot = useMemo(() => {
    if (metrics.length === 0) return null;
    return buildRollupTree(metrics);
  }, [metrics]);

  const useHierarchyHeadings = useMemo(
    () => tasks.some((t) => t.level1Group !== "All tasks"),
    [tasks]
  );

  const onFile = async (file: File | null) => {
    setParseErrors([]);
    if (!file) return;
    const isXlsx =
      file.name.toLowerCase().endsWith(".xlsx") ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const { tasks: next, errors } = isXlsx
      ? parsePowerPlayXlsx(await file.arrayBuffer())
      : parsePowerPlayCsv(await file.text());
    setParseErrors(errors);
    setTasks(next);
    setWeightage(initialWeightage(next));
  };

  const setWeight = (id: string, raw: string) => {
    const n = parseFloat(raw);
    setWeightage((w) => ({
      ...w,
      [id]: Number.isFinite(n) ? n : 0,
    }));
  };

  const distributeEqual = () => {
    setWeightage(equalWeightage(tasks));
  };

  const saveSnapshot = async () => {
    if (!weightOk) {
      setSaveMessage("Weightage must sum to 100% before saving.");
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot_period: snapshotPeriod,
          overall_completion_pct: overall,
          cumulative_achieved_weightage: overall,
          label: snapshotLabel || null,
          task_count: tasks.length,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveMessage(json.error || "Save failed");
      } else {
        setSaveMessage("Snapshot saved.");
        await loadHistory();
      }
    } catch (e) {
      setSaveMessage(
        e instanceof Error ? e.message : "Network error while saving"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <BarChart3 className="h-8 w-8 text-primary" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight text-primary">
            Construction progress tracker
          </h1>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          WBS rows with non-zero <strong>Total Quantity</strong> and a{" "}
          <strong>Unit</strong> are work items. Progress is read from Achieved /
          Completed columns when present, otherwise from Actual / Done / Progress
          or date-style columns. Target weights persist by full WBS path.
        </p>
      </header>

      <Tabs defaultValue="data" className="w-full">
        <TabsList>
          <TabsTrigger value="data" className="gap-2">
            <Upload className="h-4 w-4" />
            Data & weightage
          </TabsTrigger>
          <TabsTrigger value="hierarchy" className="gap-2">
            <FolderTree className="h-4 w-4" />
            Project hierarchy
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="gap-2">
            <Scale className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
        </TabsList>

        <TabsContent value="data" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>File upload</CardTitle>
              <CardDescription>
                Header row = first row with <strong>Level 1</strong>. Work items need
                non-zero <strong>Total Quantity</strong> and <strong>Unit</strong>.
                Task name = deepest level (7→1).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <Input
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="max-w-md cursor-pointer"
                  onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
                />
                {tasks.length > 0 && (
                  <Badge variant="secondary">
                    {tasks.length} task{tasks.length === 1 ? "" : "s"}
                  </Badge>
                )}
              </div>
              {parseErrors.length > 0 && (
                <div
                  role="alert"
                  className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <ul className="list-inside list-disc space-y-1">
                    {parseErrors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {tasks.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle>Target weightage %</CardTitle>
                  <CardDescription>
                    Leaf progress % = Actual ÷ Total × 100. Achieved weight =
                    target % × (Actual ÷ Total). Totals must equal 100%.
                  </CardDescription>
                </div>
                <Button type="button" variant="outline" onClick={distributeEqual}>
                  Split equally
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span
                    className={
                      weightOk
                        ? "font-mono text-lg font-semibold text-primary"
                        : "font-mono text-lg font-semibold text-amber-600"
                    }
                  >
                    {totalW.toFixed(2)}%
                  </span>
                  {weightOk ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <span className="text-xs text-amber-700">
                      Must equal 100%
                    </span>
                  )}
                </div>
                <div className="max-h-[min(520px,70vh)] overflow-auto pr-1">
                  <LeafWeightageTable
                    tasks={tasks}
                    weightage={weightage}
                    onWeightChange={setWeight}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="hierarchy" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Project hierarchy dashboard</CardTitle>
              <CardDescription>
                Rollup progress by WBS: parent target weight is the sum of child
                targets; parent progress % = achieved ÷ target × 100.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rollupRoot && tasks.length > 0 ? (
                <ProjectHierarchyDashboard
                  root={rollupRoot}
                  totalProjectPct={overall}
                  weightOk={weightOk}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Upload data and set target weights to see the hierarchy.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Overall progress</CardTitle>
                <CardDescription>
                  Σ (Task progress % × Weightage %) across all tasks.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProgressGauge value={overall} />
                {!weightOk && tasks.length > 0 && (
                  <p className="mt-2 text-center text-xs text-amber-700">
                    Fix weightage total to 100% for a valid overall %.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Save snapshot</CardTitle>
                <CardDescription>
                  Stores cumulative achieved weightage (overall %) so you can
                  track progress on the curve over time.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <div className="space-y-1">
                    <Label>Period</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                      value={snapshotPeriod}
                      onChange={(e) =>
                        setSnapshotPeriod(
                          e.target.value === "weekly" ? "weekly" : "daily"
                        )
                      }
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  <div className="min-w-[200px] flex-1 space-y-1">
                    <Label htmlFor="snap-label">Label (optional)</Label>
                    <Input
                      id="snap-label"
                      placeholder="e.g. Week 12 pour"
                      value={snapshotLabel}
                      onChange={(e) => setSnapshotLabel(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => void saveSnapshot()}
                  disabled={saving || !weightOk || tasks.length === 0}
                  className="gap-2"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save snapshot
                </Button>
                {saveMessage && (
                  <p className="text-sm text-muted-foreground">{saveMessage}</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cumulative progress (S-curve)</CardTitle>
              <CardDescription>
                {loadingHistory
                  ? "Loading history…"
                  : "Actual cumulative % from snapshots vs a time-linear reference."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SCurveChart data={history} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bottlenecks</CardTitle>
              <CardDescription>
                Tasks with high weightage and low physical progress (risk score
                = weight × (1 − progress)).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BottlenecksTable
                rows={bottlenecks}
                groupByLevel1={useHierarchyHeadings}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <footer className="border-t border-border pt-8 text-center">
        <p className="text-sm text-muted-foreground">
          Powered by{" "}
          <span className="font-semibold text-primary">PowerPlay</span>
        </p>
      </footer>
      </div>
    </div>
  );
}
