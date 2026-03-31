"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
} from "react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  FolderTree,
  Loader2,
  Scale,
  Sparkles,
  Upload,
} from "lucide-react";

import { BottlenecksTable } from "@/components/bottlenecks-table";
import { ProgressGauge } from "@/components/progress-gauge";
import { HierarchicalWeightageTree } from "@/components/hierarchical-weightage-tree";
import { ParentLevelDashboard } from "@/components/parent-level-dashboard";
import { ProjectAnalyticsDashboard } from "@/components/project-analytics-dashboard";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildTaskMetrics,
  computeBottlenecks,
  overallCompletionPercent,
} from "@/lib/calculations";
import {
  buildWeightTree,
  distributeToParentDescendants,
  level1Total,
  parentWeight,
} from "@/lib/hierarchical-weightage";
import { buildRollupTree } from "@/lib/hierarchy-rollup";
import { parseRevaCsv, parseRevaXlsx } from "@/lib/reva-parser";
import { cn } from "@/lib/utils";
import { equalWeightage } from "@/lib/weightage-init";
import type { ParsedTask, RevaParseResult } from "@/types/progress";

type Project = { id: string; name: string; created_at?: string };

type Phase = "idle" | "mapping" | "dashboard";

export function ConstructionMisApp() {
  const LAST_PROJECT_KEY = "mis:last-project-id";
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [activeProject, setActiveProject] = useState<Project | null>(null);

  const [sessionParse, setSessionParse] = useState<RevaParseResult | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [isNewProject, setIsNewProject] = useState(false);
  const [newTaskIds, setNewTaskIds] = useState<Set<string>>(() => new Set());

  const [leafWeightage, setLeafWeightage] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [scurve, setScurve] = useState<SnapshotPoint[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [dragOver, setDragOver] = useState(false);
  const [mainTab, setMainTab] = useState("data");
  const [latestSourceFilename, setLatestSourceFilename] = useState<string | null>(
    null
  );

  const refreshProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const r = await fetch("/api/projects");
      const j = await r.json();
      setProjects(j.projects ?? []);
    } catch {
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    if (!activeProject?.id) return;
    try {
      window.localStorage.setItem(LAST_PROJECT_KEY, activeProject.id);
    } catch {
      /* ignore */
    }
  }, [activeProject?.id]);

  useEffect(() => {
    if (loadingProjects || projects.length === 0 || activeProject) return;
    let lastId: string | null = null;
    try {
      lastId = window.localStorage.getItem(LAST_PROJECT_KEY);
    } catch {
      /* ignore */
    }
    if (!lastId) return;
    const matched = projects.find((p) => p.id === lastId);
    if (matched) void selectProject(matched);
  }, [loadingProjects, projects, activeProject]);

  const loadScurve = useCallback(async (projectId: string) => {
    setLoadingLogs(true);
    try {
      const r = await fetch(
        `/api/progress-logs?projectId=${encodeURIComponent(projectId)}`
      );
      const j = await r.json();
      const logs = j.logs as
        | { recorded_at: string; total_completion_pct: number }[]
        | undefined;
      setScurve(
        (logs ?? []).map((row) => ({
          date: row.recorded_at,
          cumulative: Number(row.total_completion_pct),
          period: "upload",
        }))
      );
    } catch {
      setScurve([]);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    if (activeProject?.id) void loadScurve(activeProject.id);
  }, [activeProject?.id, loadScurve]);

  useEffect(() => {
    if (phase === "mapping") setMainTab("data");
    if (phase === "dashboard") setMainTab("hierarchy");
  }, [phase]);

  const leaves = useMemo(
    () => sessionParse?.leaves ?? [],
    [sessionParse]
  );

  const weightTree = useMemo(
    () => buildWeightTree(sessionParse?.rows ?? [], leaves),
    [sessionParse?.rows, leaves]
  );

  const weightage = leafWeightage;

  const recordProgressLog = useCallback(
    async (projectId: string, totalPct: number, leafCount: number) => {
      try {
        await fetch("/api/progress-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            total_completion_pct: totalPct,
            leaf_count: leafCount,
            source: "upload",
          }),
        });
      } catch {
        /* non-blocking */
      }
      void loadScurve(projectId);
    },
    [loadScurve]
  );

  const saveProjectState = useCallback(
    async (projectId: string, leavesToSave: ParsedTask[], sourceFilename?: string) => {
      try {
        await fetch("/api/project-state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            leaves: leavesToSave,
            sourceFilename: sourceFilename ?? null,
          }),
        });
      } catch {
        /* non-blocking */
      }
    },
    []
  );

  async function ensureProject(name: string): Promise<Project> {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const j = await res.json();
    if (res.ok) return j.project as Project;
    if (res.status === 409) {
      const r2 = await fetch(
        `/api/projects?name=${encodeURIComponent(name)}`
      );
      const j2 = await r2.json();
      if (j2.project) return j2.project as Project;
    }
    throw new Error(j.error || "Could not create project");
  }

  const processParsedFile = useCallback(
    async (
      parsed: RevaParseResult,
      sourceFilename?: string
    ) => {
      try {
        setParseErrors(parsed.errors);
        if (parsed.leaves.length === 0) {
          if (parsed.errors.length === 0) {
            setParseErrors([
              "No leaf rows found (check Parent/Leaf and quantities).",
            ]);
          }
          return;
        }

        const name = parsed.projectName.trim() || "Untitled project";
        const byNameRes = await fetch(
          `/api/projects?name=${encodeURIComponent(name)}`
        );
        const byNameJson = await byNameRes.json();
        const existingProject = (byNameJson.project ?? null) as Project | null;
        setLatestSourceFilename(sourceFilename ?? null);
        setSessionParse(parsed);

        if (!existingProject) {
          setActiveProject(null);
          setIsNewProject(true);
          setLeafWeightage(equalWeightage(parsed.leaves));
          setNewTaskIds(new Set(parsed.leaves.map((l) => l.taskId)));
          setPhase("mapping");
          return;
        }

        setActiveProject(existingProject);
        setIsNewProject(false);

        const rW = await fetch(
          `/api/task-settings?projectId=${encodeURIComponent(existingProject.id)}`
        );
        const jW = await rW.json();
        const dbw = (jW.weights ?? {}) as Record<string, number>;
        const detectedNew = new Set<string>();
        const nextLeafWeights: Record<string, number> = {};
        for (const leaf of parsed.leaves) {
          const v = dbw[leaf.taskId];
          if (v == null || !Number.isFinite(v)) detectedNew.add(leaf.taskId);
          nextLeafWeights[leaf.id] = v != null && Number.isFinite(v) ? v : 0;
        }
        setLeafWeightage(nextLeafWeights);
        setNewTaskIds(detectedNew);
        setPhase(detectedNew.size > 0 ? "mapping" : "dashboard");

        void saveProjectState(existingProject.id, parsed.leaves, sourceFilename);
        if (detectedNew.size === 0) {
          const metrics = buildTaskMetrics(parsed.leaves, nextLeafWeights);
          const overall = overallCompletionPercent(metrics);
          void recordProgressLog(existingProject.id, overall, parsed.leaves.length);
        }
        void refreshProjects();
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Could not create/load project";
        setSaveError(msg);
        setParseErrors((prev) => [...prev, msg]);
      }
    },
    [refreshProjects, recordProgressLog, saveProjectState]
  );

  const onFile = async (file: File | null) => {
    if (!file) return;
    setSaveError(null);
    const lower = file.name.toLowerCase();
    const isXlsx =
      lower.endsWith(".xlsx") ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    const parsed = isXlsx
      ? parseRevaXlsx(await file.arrayBuffer(), file.name)
      : parseRevaCsv(await file.text(), file.name);

    await processParsedFile(parsed, file.name);
  };

  const setParentWeight = (nodeId: string, raw: string) => {
    const n = parseFloat(raw);
    setLeafWeightage((prev) =>
      distributeToParentDescendants(
        weightTree,
        prev,
        nodeId,
        Number.isFinite(n) ? n : 0
      )
    );
  };

  const setLeafWeight = (leafNodeId: string, raw: string) => {
    const n = parseFloat(raw);
    setLeafWeightage((prev) => ({
      ...prev,
      [leafNodeId]: Number.isFinite(n) ? n : 0,
    }));
  };

  const distributeEqualForParent = (nodeId: string) => {
    const current = parentWeight(weightTree, leafWeightage, nodeId);
    setLeafWeightage((prev) =>
      distributeToParentDescendants(weightTree, prev, nodeId, current)
    );
  };

  const metrics = useMemo(
    () => buildTaskMetrics(leaves, weightage),
    [leaves, weightage]
  );
  const overall = overallCompletionPercent(metrics);
  const totalParentPct = level1Total(weightTree, leafWeightage);
  const weightOk =
    weightTree.level1ParentIds.length === 0 || Math.abs(totalParentPct - 100) < 0.01;
  const bottlenecks = useMemo(() => computeBottlenecks(metrics), [metrics]);
  const rollupRoot = useMemo(() => {
    if (metrics.length === 0) return null;
    return buildRollupTree(metrics);
  }, [metrics]);

  const showNewTasksAlert =
    phase === "mapping" && newTaskIds.size > 0 && !isNewProject;

  const saveMappingAndContinue = async () => {
    if (!weightOk) {
      setSaveError("Grand total of Level 1 parents must be 100%.");
      return;
    }
    if (!sessionParse || sessionParse.leaves.length === 0) return;

    setSaving(true);
    setSaveError(null);
    try {
      const name =
        sessionParse.projectName.trim() || "Untitled project";
      let project = activeProject;

      if (isNewProject || !project) {
        project = await ensureProject(name);
        setActiveProject(project);
        setIsNewProject(false);
      }

      const weights: Record<string, number> = Object.fromEntries(
        sessionParse.leaves.map((l) => [l.taskId, leafWeightage[l.id] ?? 0])
      );

      const resTs = await fetch("/api/task-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, weights }),
      });
      if (!resTs.ok) {
        const j = await resTs.json();
        throw new Error(j.error || "Could not save weights");
      }

      setNewTaskIds(new Set());
      setPhase("dashboard");

      const m = buildTaskMetrics(sessionParse.leaves, leafWeightage);
      const tot = overallCompletionPercent(m);
      await recordProgressLog(project.id, tot, sessionParse.leaves.length);
      await saveProjectState(
        project.id,
        sessionParse.leaves,
        latestSourceFilename ?? undefined
      );
      void refreshProjects();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const selectProject = async (p: Project) => {
    setActiveProject(p);
    setPhase("idle");
    setParseErrors([]);
    setLeafWeightage({});
    setNewTaskIds(new Set());
    setIsNewProject(false);
    setSaveError(null);
    setLatestSourceFilename(null);

    try {
      const [stateRes, weightRes] = await Promise.all([
        fetch(`/api/project-state?projectId=${encodeURIComponent(p.id)}`),
        fetch(`/api/task-settings?projectId=${encodeURIComponent(p.id)}`),
      ]);
      const stateJson = await stateRes.json();
      const weightJson = await weightRes.json();

      const state = stateJson.state as
        | { source_filename: string | null; leaves_json: ParsedTask[] }
        | null;
      const leavesFromDb = Array.isArray(state?.leaves_json) ? state.leaves_json : [];

      if (leavesFromDb.length === 0) {
        setSessionParse(null);
        setPhase("idle");
        return;
      }

      const parsed: RevaParseResult = {
        projectName: p.name,
        rows: [],
        leaves: leavesFromDb,
        errors: [],
      };
      const dbw = (weightJson.weights ?? {}) as Record<string, number>;
      const w: Record<string, number> = {};
      for (const leaf of leavesFromDb) {
        const v = dbw[leaf.taskId];
        w[leaf.id] = v != null && Number.isFinite(v) ? v : 0;
      }

      setSessionParse(parsed);
      setLeafWeightage(w);
      setLatestSourceFilename(state?.source_filename ?? null);
      setPhase("dashboard");
    } catch {
      setSessionParse(null);
      setPhase("idle");
    }
  };

  const displayProjectName =
    sessionParse?.projectName?.trim() ||
    activeProject?.name ||
    "Select a project";

  const dropHandlers = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(true);
    },
    onDragLeave: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void onFile(f);
    },
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/50 to-white text-foreground">
      <header className="sticky top-0 z-20 w-full bg-blue-600 px-4 py-3 text-white shadow-lg">
        <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            <h1 className="text-lg font-semibold tracking-wide sm:text-xl">
              SiteSense AI
            </h1>
          </div>
          <p className="text-xs font-medium text-blue-100 sm:text-sm">
            Powered by <span className="font-semibold text-white">PowerPlay</span>
          </p>
        </div>
      </header>

      <div className="w-full px-2 py-3 sm:px-4 sm:py-5 lg:flex lg:gap-5 lg:px-6">
        <aside className="mb-6 w-full shrink-0 lg:mb-0 lg:w-64">
          <div className="space-y-3 rounded-2xl border border-blue-200 bg-gradient-to-b from-blue-50 to-blue-100/60 p-3 shadow-sm lg:sticky lg:top-4">
            <div className="flex items-center gap-2 text-blue-700">
              <Building2 className="h-7 w-7" aria-hidden />
              <p className="text-sm font-semibold uppercase tracking-wide">
                Projects
              </p>
            </div>
            {loadingProjects ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : projects.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Upload a Project file to create and see the project data.
              </p>
            ) : (
              <ul className="max-h-[260px] space-y-1 overflow-auto rounded-xl border border-blue-200 bg-white/85 p-1.5 backdrop-blur lg:max-h-[70vh]">
                {projects.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => selectProject(p)}
                      title={p.name}
                      className={cn(
                        "w-full rounded-lg px-3 py-2 text-left text-sm transition-all duration-200 active:scale-[0.98]",
                        activeProject?.id === p.id
                          ? "bg-blue-600 font-medium text-white shadow-md shadow-blue-300/50"
                          : "bg-white/80 text-slate-700 hover:bg-blue-50 hover:shadow-sm"
                      )}
                    >
                      <span className="line-clamp-1">{p.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-5 lg:space-y-7">
          <header className="space-y-2 rounded-xl border border-blue-100 bg-white/80 px-4 py-4 shadow-sm backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-2">
              <BarChart3 className="h-8 w-8 text-primary" aria-hidden />
              <h1 className="text-xl font-semibold tracking-tight text-primary sm:text-2xl">
                SiteSense AI Dashboard
              </h1>
            </div>
            <p className="text-sm font-medium text-foreground">
              Active:{" "}
              <span className="text-primary">{displayProjectName}</span>
            </p>
          </header>

          <Card className="border-blue-100 bg-white/90 shadow-sm">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Progress Report
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                {...dropHandlers}
                className={cn(
                  "rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/35 bg-muted/20"
                )}
              >
                <Input
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="mx-auto max-w-md cursor-pointer"
                  onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
                />
                <p className="mt-3 text-xs text-muted-foreground">
                  Drag and drop a file here, or choose a file.
                </p>
              </div>
              {leaves.length > 0 && (
                <Badge variant="secondary">
                  {leaves.length} leaf task{leaves.length === 1 ? "" : "s"}
                </Badge>
              )}
              {parseErrors.length > 0 && (
                <div
                  role="alert"
                  className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <ul className="list-inside list-disc space-y-1">
                    {parseErrors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                  </ul>
                </div>
              )}
              {showNewTasksAlert && (
                <div
                  role="status"
                  className="flex gap-2 rounded-lg border-2 border-amber-500 bg-amber-50/90 p-4 text-sm font-semibold text-amber-950"
                >
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  New Tasks Detected! Assign weights to new rows and rebalance
                  existing ones so the total is 100%.
                </div>
              )}
            </CardContent>
          </Card>

          {phase === "idle" && activeProject && !sessionParse && (
            <Card className="border-primary/30 bg-muted/30">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Upload a Reva extract for <strong>{activeProject.name}</strong>{" "}
                to view the dashboard and hierarchy.
              </CardContent>
            </Card>
          )}

          {(phase === "mapping" || (phase === "dashboard" && sessionParse)) && (
            <Tabs
              value={mainTab}
              onValueChange={setMainTab}
              className="w-full"
            >
              <div className="overflow-x-auto">
                <TabsList className="min-w-max rounded-xl bg-blue-50/80 p-1">
                  <TabsTrigger value="data" className="gap-2 whitespace-nowrap">
                  <Upload className="h-4 w-4" />
                  Weights
                </TabsTrigger>
                <TabsTrigger value="hierarchy" className="gap-2 whitespace-nowrap">
                  <FolderTree className="h-4 w-4" />
                  Hierarchy
                </TabsTrigger>
                <TabsTrigger value="dashboard" className="gap-2 whitespace-nowrap">
                  <Scale className="h-4 w-4" />
                  Dashboard
                </TabsTrigger>
                <TabsTrigger value="parents" className="gap-2 whitespace-nowrap">
                  <FolderTree className="h-4 w-4" />
                  Parent Tasks
                </TabsTrigger>
                <TabsTrigger value="analytics" className="gap-2 whitespace-nowrap">
                  <BarChart3 className="h-4 w-4" />
                  Project Analytics
                </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="data" className="space-y-6 mt-6">
                {sessionParse && leaves.length > 0 && (
                  <Card>
                    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
                      <div>
                        <CardTitle>Hierarchical weightage mapping</CardTitle>
                        <CardDescription>
                          Expand parent tasks from the uploaded Parent/Leaf + Level
                          hierarchy. Parent updates distribute to descendant leaves;
                          leaf edits bubble sums back up. Grand total at Level 1 must
                          be 100%.
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm text-muted-foreground">
                          Total
                        </span>
                        <span
                          className={
                            weightOk
                              ? "font-mono text-lg font-semibold text-primary"
                              : "font-mono text-lg font-semibold text-amber-600"
                          }
                        >
                          {totalParentPct.toFixed(2)}%
                        </span>
                        {weightOk ? (
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                        ) : (
                          <span className="text-xs text-amber-800">
                            Level 1 total must equal 100%
                          </span>
                        )}
                      </div>
                      <div className="max-h-[min(520px,70vh)] overflow-auto pr-1">
                        <HierarchicalWeightageTree
                          tree={weightTree}
                          leafWeights={leafWeightage}
                          onLeafChange={setLeafWeight}
                          onParentChange={setParentWeight}
                          onDistributeEqual={distributeEqualForParent}
                          highlightedTaskIds={
                            isNewProject ? undefined : newTaskIds
                          }
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          type="button"
                          onClick={() => void saveMappingAndContinue()}
                          disabled={saving || !weightOk}
                          className="gap-2"
                        >
                          {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : null}
                          {isNewProject
                            ? "Create project & save weightages"
                            : "Save weightages"}
                        </Button>
                        {saveError && (
                          <p className="text-sm text-destructive">{saveError}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

              </TabsContent>

              <TabsContent value="hierarchy" className="mt-6 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Tree grid</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {rollupRoot && leaves.length > 0 ? (
                      <ProjectHierarchyDashboard
                        root={rollupRoot}
                        totalProjectPct={overall}
                        weightOk={weightOk}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Parse a file with valid leaf rows to see the hierarchy.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="dashboard" className="mt-6 space-y-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Overall progress</CardTitle>
                      <CardDescription>
                        Sum of achieved target weights (current file).
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ProgressGauge value={overall} />
                      {!weightOk && weightTree.level1ParentIds.length > 0 && (
                        <p className="mt-2 text-center text-xs text-amber-800">
                          Level 1 parent total should be 100% for a valid MIS total.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Progress history (S-curve)</CardTitle>
                    <CardDescription>
                      {loadingLogs
                        ? "Loading…"
                        : "Logged automatically on each upload (total project %)."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SCurveChart data={scurve} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Bottlenecks</CardTitle>
                    <CardDescription>
                      High weight × low physical progress.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <BottlenecksTable rows={bottlenecks} groupByLevel1={false} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="parents" className="mt-6 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Parent Task Progress Dashboard</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {rollupRoot && leaves.length > 0 ? (
                      <ParentLevelDashboard
                        rows={sessionParse?.rows ?? []}
                        metrics={metrics}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Upload and map a file to view parent-level progress.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="analytics" className="mt-6 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Project Analytics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ProjectAnalyticsDashboard
                      leaves={leaves}
                      weightage={weightage}
                      actualLogs={scurve.map((p) => ({
                        date: p.date,
                        value: Number(p.cumulative),
                      }))}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>

    </div>
  );
}
