/** Internal: full grid row from Reva-style extract (parent + leaf rows). */
export type RevaParsedRow = {
  taskId: string;
  taskName: string;
  nodeKind: "parent" | "leaf";
  parentTaskId: string | null;
  /** Optional hierarchy depth parsed from Level columns (1 = top). */
  level: number | null;
  totalQty: number;
  actualQty: number;
  /** 0–100 physical completion */
  physicalProgressPct: number;
  /** True when Progress Percentage column drove physical % */
  progressFromPercentColumn: boolean;
  unit: string;
};

/**
 * Leaf work item for weightage & rollups (Reva MIS or legacy PowerPlay CSV).
 * Persist weights by `taskId` in Supabase; legacy exports use `taskId === id`.
 */
export type ParsedTask = {
  id: string;
  taskId: string;
  name: string;
  fullPath: string;
  unit: string;
  actualQty: number;
  totalQty: number;
  physicalProgressPct: number;
  progressFromPercentColumn: boolean;
  nodeKind?: "parent" | "leaf";
  parentTaskId?: string | null;
  taskName?: string;
  weightageFromFile?: number;
  level1Group?: string;
  level2Group?: string;
  hierarchyPath?: string;
  pathSegments?: string[];
  startDate?: string | null;
  endDate?: string | null;
};

export type TaskWithMetrics = ParsedTask & {
  weightagePercent: number;
  taskProgressPercent: number;
  achievedWeightagePercent: number;
  /** Path segments for WBS rollup tree (from fullPath or CSV) */
  pathSegments: string[];
  level1Group: string;
};

export type ProgressSnapshotRow = {
  id: string;
  created_at: string;
  snapshot_period: "daily" | "weekly";
  overall_completion_pct: number;
  label: string | null;
};

export type ProgressLogPoint = {
  id: string;
  recorded_at: string;
  total_completion_pct: number;
  leaf_count: number | null;
};

/** Rollup tree node for hierarchy dashboard */
export type RollupTreeNode = {
  pathKey: string;
  label: string;
  /** Empty for synthetic path nodes; leaf uses Task ID from extract */
  taskId: string;
  depth: number;
  isLeaf: boolean;
  children: RollupTreeNode[];
  leaf?: TaskWithMetrics;
  targetWeightSum: number;
  achievedWeightSum: number;
  rollupProgressPct: number;
};

export type RevaParseResult = {
  projectName: string;
  rows: RevaParsedRow[];
  leaves: ParsedTask[];
  errors: string[];
};
