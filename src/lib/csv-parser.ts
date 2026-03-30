import Papa from "papaparse";
import * as XLSX from "xlsx";

import type { ParsedTask } from "@/types/progress";

const TASK_COLUMN_CANDIDATES = [
  "level 2",
  "task details",
  "level2",
  "task name",
  "task",
  "activity",
  "description",
];

/** Fallback when exact PowerPlay names are absent (legacy exports). */
const ACTUAL_FALLBACK_CANDIDATES = [
  "achieved quantity",
  "completed qty",
  "actual quantity",
  "actual qty",
  "actual",
  "qty actual",
  "executed qty",
];

const TOTAL_FALLBACK_CANDIDATES = [
  "total quantity",
  "total qty",
  "planned qty",
  "qty total",
  "quantity",
  "boq qty",
];

const WEIGHT_FALLBACK_CANDIDATES = [
  "weightage",
  "weightage %",
  "weight %",
  "weight",
];

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[%#]/g, "");
}

function findColumn(
  headers: string[],
  candidates: string[]
): string | undefined {
  const map = new Map(headers.map((h) => [normalizeHeader(h), h]));
  for (const c of candidates) {
    const hit = map.get(c);
    if (hit) return hit;
  }
  for (const h of headers) {
    const n = normalizeHeader(h);
    for (const c of candidates) {
      if (n.includes(c) || c.includes(n)) return h;
    }
  }
  return undefined;
}

/** Exact normalized header match (e.g. "Total Quantity"). */
function findColumnExact(headers: string[], label: string): string | undefined {
  const want = normalizeHeader(label);
  for (const h of headers) {
    if (normalizeHeader(h) === want) return h;
  }
  return undefined;
}

function findLevelColumn(headers: string[], n: number): string | undefined {
  const map = new Map(headers.map((h) => [normalizeHeader(h), h]));
  const spaced = `level ${n}`;
  const compact = `level${n}`;
  const lSpaced = `l ${n}`;
  const lCompact = `l${n}`;
  return (
    map.get(spaced) ??
    map.get(compact) ??
    map.get(lSpaced) ??
    map.get(lCompact)
  );
}

/** Maps index 0 → Level 1, … index 6 → Level 7. */
export function resolveLevelColumnKeys(
  headers: string[]
): (string | undefined)[] {
  return [1, 2, 3, 4, 5, 6, 7].map((n) => findLevelColumn(headers, n));
}

function hasHierarchyColumns(levelKeys: (string | undefined)[]): boolean {
  return levelKeys.some((k) => k !== undefined);
}

type RowRecord = Record<string, unknown>;

/**
 * Final line item: first non-empty value scanning Level 7 → Level 1 (leaf node).
 */
export function getTaskName(
  row: RowRecord,
  levelKeys: (string | undefined)[]
): string {
  for (let n = 7; n >= 1; n--) {
    const key = levelKeys[n - 1];
    if (!key) continue;
    const v = String(row[key] ?? "").trim();
    if (v) return v;
  }
  return "";
}

function taskLevelIndex(
  row: RowRecord,
  levelKeys: (string | undefined)[]
): number | null {
  for (let n = 7; n >= 1; n--) {
    const key = levelKeys[n - 1];
    if (!key) continue;
    if (String(row[key] ?? "").trim()) return n;
  }
  return null;
}

function pathKeyFromRow(
  row: RowRecord,
  levelKeys: (string | undefined)[],
  deepest: number
): string {
  const parts: string[] = [];
  for (let n = 1; n <= deepest; n++) {
    const key = levelKeys[n - 1];
    parts.push(key ? String(row[key] ?? "").trim() : "");
  }
  return parts.join("\x1f");
}

/** Human-readable path for duplicate handling and DB key. */
function fullPathDisplayFromRow(
  row: RowRecord,
  levelKeys: (string | undefined)[],
  deepest: number
): string {
  const parts: string[] = [];
  for (let n = 1; n <= deepest; n++) {
    const key = levelKeys[n - 1];
    const v = key ? String(row[key] ?? "").trim() : "";
    if (v) parts.push(v);
  }
  return parts.join(" > ");
}

function pathSegmentsFromRow(
  row: RowRecord,
  levelKeys: (string | undefined)[],
  deepest: number
): string[] {
  const parts: string[] = [];
  for (let n = 1; n <= deepest; n++) {
    const key = levelKeys[n - 1];
    const v = key ? String(row[key] ?? "").trim() : "";
    if (v) parts.push(v);
  }
  return parts;
}

function isLeafRow(
  row: RowRecord,
  totalCol: string,
  unitCol: string | undefined
): boolean {
  const totalStr = String(row[totalCol] ?? "").trim();
  if (!totalStr) return false;
  if (parseNumber(row[totalCol]) <= 0) return false;
  if (!unitCol) return false;
  const unitStr = String(row[unitCol] ?? "").trim();
  if (!unitStr) return false;
  return true;
}

/** DD/MM/YYYY, MM-DD-YY, etc. */
function headerLooksLikeDate(header: string): boolean {
  const t = header.trim();
  return /^\d{1,2}[\\/.\-]\d{1,2}[\\/.\-]\d{2,4}/.test(t);
}

/**
 * When Achieved/Completed columns are missing: prefer date-style headers, then
 * keywords (actual, done, progress, …), then other numeric columns.
 */
export function findIntelligentProgressColumn(
  headers: string[],
  rows: RowRecord[],
  exclude: Set<string>
): string | undefined {
  const keywordRe =
    /\b(actual|done|progress|achieved|completed|executed|physical)\b/i;
  const noiseRe =
    /\b(total|planned|budget|boq|weight|level\s*\d|unit|uom|rate|amount)\b/i;

  const scored: { h: string; score: number; priority: number }[] = [];
  const sample = rows.slice(0, Math.min(50, rows.length));

  for (const h of headers) {
    if (exclude.has(h)) continue;
    const raw = h.trim();
    if (!raw) continue;
    const n = normalizeHeader(h);

    let priority = 4;
    if (headerLooksLikeDate(raw)) priority = 0;
    else if (keywordRe.test(n) && !noiseRe.test(n)) priority = 1;
    else if (!noiseRe.test(n) && /[a-z]/i.test(raw)) priority = 3;

    let score = 0;
    for (const r of sample) {
      if (Number.isFinite(parseNumber(r[h]))) score += 1;
    }
    if (score === 0) continue;
    if (priority === 4) continue;

    scored.push({ h, score, priority });
  }

  scored.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.score - a.score;
  });

  if (scored.length > 0) return scored[0]!.h;

  for (const h of headers) {
    if (exclude.has(h)) continue;
    if (noiseRe.test(normalizeHeader(h))) continue;
    let score = 0;
    for (const r of sample) {
      if (Number.isFinite(parseNumber(r[h]))) score += 1;
    }
    if (score >= Math.max(3, sample.length * 0.2)) {
      return h;
    }
  }

  return undefined;
}

function hierarchyPathFromRow(
  row: RowRecord,
  levelKeys: (string | undefined)[],
  deepest: number
): string | undefined {
  if (deepest <= 1) return undefined;
  const parents: string[] = [];
  for (let n = 1; n < deepest; n++) {
    const key = levelKeys[n - 1];
    if (!key) continue;
    const v = String(row[key] ?? "").trim();
    if (v) parents.push(v);
  }
  return parents.length ? parents.join(" › ") : undefined;
}

function level1GroupFromRow(
  row: RowRecord,
  levelKeys: (string | undefined)[]
): string {
  const k0 = levelKeys[0];
  const v = k0 ? String(row[k0] ?? "").trim() : "";
  return v || "(No Level 1)";
}

function parseNumber(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const cleaned = String(raw).replace(/,/g, "").replace(/%/g, "").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function rowHasContent(row: RowRecord): boolean {
  return Object.values(row).some((v) => String(v ?? "").trim() !== "");
}

/** Find the row whose cells include the real header starting with Level 1. */
function findHeaderRowIndex(matrix: string[][]): number {
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i];
    if (!row) continue;
    for (const cell of row) {
      if (normalizeHeader(String(cell)) === "level 1") return i;
    }
  }
  return -1;
}

function matrixToRowRecords(matrix: string[][], headerRowIndex: number): {
  rows: RowRecord[];
} {
  const headerCells = (matrix[headerRowIndex] ?? []).map((c) =>
    String(c ?? "").trim()
  );
  const seen = new Map<string, number>();
  const headers = headerCells.map((h, i) => {
    let base = h || `__col_${i}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    if (n > 1) base = `${base}__${n}`;
    return base;
  });

  const rows: RowRecord[] = [];
  const maxCols = headers.length;

  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const raw = matrix[r] ?? [];
    if (!raw.some((c) => String(c ?? "").trim() !== "")) continue;
    const o: RowRecord = {};
    for (let j = 0; j < maxCols; j++) {
      o[headers[j]!] = raw[j] ?? "";
    }
    rows.push(o);
  }

  return { rows };
}

function resolveQuantityAndWeightColumns(
  headers: string[],
  strictPowerPlay: boolean
): {
  totalCol: string | undefined;
  actualCol: string | undefined;
  weightCol: string | undefined;
  unitCol: string | undefined;
  error: string | undefined;
} {
  const totalCol =
    findColumnExact(headers, "Total Quantity") ??
    (!strictPowerPlay
      ? findColumn(headers, TOTAL_FALLBACK_CANDIDATES)
      : undefined);

  const actualCol =
    findColumnExact(headers, "Achieved Quantity") ??
    findColumnExact(headers, "Completed Qty") ??
    (!strictPowerPlay
      ? findColumn(headers, ACTUAL_FALLBACK_CANDIDATES)
      : undefined);

  const weightCol =
    findColumnExact(headers, "Weightage (%)") ??
    findColumn(headers, WEIGHT_FALLBACK_CANDIDATES);

  const unitCol =
    findColumnExact(headers, "Unit") ??
    (!strictPowerPlay ? findColumn(headers, ["uom", "units"]) : undefined);

  if (strictPowerPlay) {
    if (!totalCol) {
      return {
        totalCol: undefined,
        actualCol: undefined,
        weightCol: undefined,
        unitCol: undefined,
        error: 'Missing required column "Total Quantity".',
      };
    }
    if (!unitCol) {
      return {
        totalCol,
        actualCol,
        weightCol: undefined,
        unitCol: undefined,
        error: 'Missing required column "Unit".',
      };
    }
  }

  return { totalCol, actualCol, weightCol, unitCol, error: undefined };
}

/**
 * PowerPlay rows: header row must contain Level 1–7; strict column names when
 * hierarchy columns exist.
 */
export function parsePowerPlayRows(rowsIn: RowRecord[]): {
  tasks: ParsedTask[];
  errors: string[];
} {
  const errors: string[] = [];
  const rows = rowsIn.filter(rowHasContent);
  if (rows.length === 0) {
    return { tasks: [], errors: [...errors, "No data rows found."] };
  }

  const headers = Object.keys(rows[0]!);
  const levelKeys = resolveLevelColumnKeys(headers);
  const useHierarchy = hasHierarchyColumns(levelKeys);

  const qtyResolved = resolveQuantityAndWeightColumns(headers, useHierarchy);

  if (qtyResolved.error) {
    return { tasks: [], errors: [...errors, qtyResolved.error] };
  }

  let totalCol = qtyResolved.totalCol;
  let actualCol = qtyResolved.actualCol;
  const weightCol = qtyResolved.weightCol;
  const unitCol = qtyResolved.unitCol;

  if (useHierarchy && totalCol && unitCol && !actualCol) {
    const exclude = new Set<string>([
      totalCol,
      unitCol,
      ...(weightCol ? [weightCol] : []),
      ...(levelKeys.filter(Boolean) as string[]),
    ]);
    actualCol = findIntelligentProgressColumn(headers, rows, exclude);
  }

  if (!useHierarchy && (!actualCol || !totalCol)) {
    const numericCols = headers.filter((h) => {
      const sample = rows.slice(0, 20).map((r) => parseNumber(r[h]));
      return sample.some((n) => n > 0);
    });
    if (!actualCol && numericCols.length >= 2) {
      actualCol = numericCols[0];
      totalCol = totalCol ?? numericCols[1];
    } else if (!actualCol && numericCols.length === 1) {
      actualCol = numericCols[0];
      totalCol = totalCol ?? numericCols[0];
    }
  }

  if (!totalCol || !actualCol) {
    return {
      tasks: [],
      errors: [
        ...errors,
        useHierarchy
          ? "Could not detect progress quantity: add Achieved/Completed Quantity, or a column with Actual/Done/Progress or a date header containing values."
          : "Could not map Total Quantity / progress columns.",
      ],
    };
  }

  let taskCol: string | undefined;
  if (!useHierarchy) {
    taskCol = findColumn(headers, TASK_COLUMN_CANDIDATES);
    if (!taskCol) {
      return {
        tasks: [],
        errors: [
          ...errors,
          `Could not find Level 1–7 columns or a task column. Found: ${headers.join(", ")}`,
        ],
      };
    }
  }

  const byKey = new Map<
    string,
    {
      name: string;
      fullPath: string;
      pathSegments: string[];
      level1Group: string;
      level2Group?: string;
      hierarchyPath?: string;
      actual: number;
      total: number;
      unit: string;
      weightageFromFile?: number;
    }
  >();

  for (const row of rows) {
    const actual = parseNumber(row[actualCol]);
    const total = parseNumber(row[totalCol]);
    const w = weightCol ? parseNumber(row[weightCol]) : undefined;

    if (useHierarchy) {
      const k0 = levelKeys[0];
      if (!k0 || !String(row[k0] ?? "").trim()) continue;

      if (!isLeafRow(row, totalCol, unitCol)) continue;

      const name = getTaskName(row, levelKeys);
      if (!name) continue;
      const deepest = taskLevelIndex(row, levelKeys);
      if (deepest === null) continue;

      const pathKey = pathKeyFromRow(row, levelKeys, deepest);
      const fullPath = fullPathDisplayFromRow(row, levelKeys, deepest);
      const pathSegments = pathSegmentsFromRow(row, levelKeys, deepest);
      const level1Group = level1GroupFromRow(row, levelKeys);
      const level2Group =
        pathSegments.length >= 2 ? pathSegments[1] : undefined;
      const hierarchyPath = hierarchyPathFromRow(row, levelKeys, deepest);
      const unitStr = unitCol ? String(row[unitCol] ?? "").trim() : "";

      const prev = byKey.get(pathKey);
      if (prev) {
        prev.actual += actual;
        prev.total += total;
        if (prev.weightageFromFile === undefined && w !== undefined) {
          prev.weightageFromFile = w;
        }
      } else {
        byKey.set(pathKey, {
          name,
          fullPath,
          pathSegments,
          level1Group,
          level2Group,
          hierarchyPath,
          actual,
          total,
          unit: unitStr,
          weightageFromFile: w !== undefined ? w : undefined,
        });
      }
    } else {
      const name = String(row[taskCol!] ?? "").trim();
      if (!name) continue;
      if (!String(row[totalCol] ?? "").trim()) continue;

      const unitStr = unitCol ? String(row[unitCol] ?? "").trim() : "";

      const prev = byKey.get(name);
      if (prev) {
        prev.actual += actual;
        prev.total += total;
        if (prev.weightageFromFile === undefined && w !== undefined) {
          prev.weightageFromFile = w;
        }
      } else {
        byKey.set(name, {
          name,
          fullPath: name,
          pathSegments: [name],
          level1Group: "All tasks",
          level2Group: undefined,
          hierarchyPath: undefined,
          actual,
          total,
          unit: unitStr,
          weightageFromFile: w !== undefined ? w : undefined,
        });
      }
    }
  }

  if (byKey.size === 0) {
    return {
      tasks: [],
      errors: [
        ...errors,
        useHierarchy
          ? "No leaf rows found. Leaves need Level 1, Total Quantity, Unit, and a line item (Level 7–1)."
          : "No rows with a task name were found.",
      ],
    };
  }

  const usedPaths = new Set<string>();
  const tasks: ParsedTask[] = [];
  for (const [, t] of byKey) {
    let id = t.fullPath;
    let n = 0;
    while (usedPaths.has(id)) {
      n += 1;
      id = `${t.fullPath} [${n}]`;
    }
    usedPaths.add(id);
    const physicalProgressPct =
      t.total > 0
        ? Math.min(100, Math.max(0, (t.actual / t.total) * 100))
        : 0;
    tasks.push({
      id,
      taskId: id,
      fullPath: t.fullPath,
      pathSegments: t.pathSegments,
      name: t.name,
      taskName: t.name,
      nodeKind: "leaf",
      parentTaskId: null,
      level1Group: t.level1Group,
      level2Group: t.level2Group,
      hierarchyPath: t.hierarchyPath,
      actualQty: t.actual,
      totalQty: t.total,
      physicalProgressPct,
      progressFromPercentColumn: false,
      unit: t.unit,
      ...(t.weightageFromFile !== undefined
        ? { weightageFromFile: t.weightageFromFile }
        : {}),
    });
  }

  return { tasks, errors };
}

/**
 * Parse CSV: detect header row by finding "Level 1", then parse rows.
 */
export function parsePowerPlayCsv(text: string): {
  tasks: ParsedTask[];
  errors: string[];
} {
  const errors: string[] = [];
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: false,
  });

  if (parsed.errors.length) {
    errors.push(
      ...parsed.errors.slice(0, 5).map((e) => e.message || "Parse error")
    );
  }

  const matrix: string[][] = parsed.data.map((row) =>
    (row ?? []).map((c) => String(c ?? "").trim())
  );

  const hi = findHeaderRowIndex(matrix);
  if (hi < 0) {
    return {
      tasks: [],
      errors: [
        ...errors,
        'Could not find a header row containing "Level 1". Add a row with Level 1–7 column titles.',
      ],
    };
  }

  const { rows } = matrixToRowRecords(matrix, hi);
  const result = parsePowerPlayRows(rows);
  return { tasks: result.tasks, errors: [...errors, ...result.errors] };
}

/**
 * Parse .xlsx: first sheet, header row = row that contains "Level 1".
 */
export function parsePowerPlayXlsx(buffer: ArrayBuffer): {
  tasks: ParsedTask[];
  errors: string[];
} {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array" });
  } catch (e) {
    return {
      tasks: [],
      errors: [e instanceof Error ? e.message : "Could not read Excel file."],
    };
  }
  if (!wb.SheetNames.length) {
    return { tasks: [], errors: ["Workbook has no sheets."] };
  }
  const sheet = wb.Sheets[wb.SheetNames[0]!]!;
  const aoa = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as (string | number | undefined)[][];

  const matrix: string[][] = aoa.map((row) =>
    (row ?? []).map((c) => String(c ?? "").trim())
  );

  const hi = findHeaderRowIndex(matrix);
  if (hi < 0) {
    return {
      tasks: [],
      errors: [
        'Could not find a header row containing "Level 1". Add a row with Level 1–7 column titles.',
      ],
    };
  }

  const { rows } = matrixToRowRecords(matrix, hi);
  return parsePowerPlayRows(rows);
}
