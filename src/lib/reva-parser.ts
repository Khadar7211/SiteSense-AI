import Papa from "papaparse";
import * as XLSX from "xlsx";

import type { ParsedTask, RevaParseResult, RevaParsedRow } from "@/types/progress";

const HEADER_SCAN_LIMIT = 5;

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[%#]/g, "");
}

function findColumn(headers: string[], candidates: string[]): string | undefined {
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

function parseNumber(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const cleaned = String(raw).replace(/,/g, "").replace(/%/g, "").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toIsoDate(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString();
  }
  const s = String(raw).trim();
  if (!s) return null;
  // Excel serial date fallback (days since 1899-12-30)
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

type RowRec = Record<string, unknown>;

function detectHeaderRowIndex(matrix: string[][]): number {
  const max = Math.min(HEADER_SCAN_LIMIT, matrix.length);
  let bestIdx = 0;
  let bestScore = -1;
  const keyRe =
    /(task\s*id|parent\s*\/?\s*leaf|task\s*names?|level(\s*\d+)?|uom|unit)/i;
  for (let i = 0; i < max; i++) {
    const row = matrix[i] ?? [];
    const score = row.reduce((acc, c) => {
      const v = String(c ?? "").trim();
      if (!v) return acc;
      return acc + (keyRe.test(v) ? 2 : 0) + 1;
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function titleCaseWords(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      const lower = w.toLowerCase();
      if (["llp", "ltd", "pvt", "inc"].includes(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function normalizeProjectNameFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/i, "").trim();
  if (!base) return "Untitled project";

  let s = base
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Split common packed company suffixes: infrallp -> infra llp
  s = s.replace(/([a-z])llp\b/gi, "$1 llp");

  const months =
    "(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)";
  s = s.replace(new RegExp(`\\b\\d{1,2}\\s+${months}\\s+\\d{2,4}\\b`, "gi"), "");
  s = s.replace(new RegExp(`\\b${months}\\s+\\d{1,2}\\s+\\d{2,4}\\b`, "gi"), "");
  s = s.replace(/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g, "");
  s = s.replace(/\b20\d{2}\b/g, "");

  // Drop upload/version suffix terms so repeated extracts map to one project.
  s = s.replace(/\bextract\b/gi, "");
  s = s.replace(/\bexport\b/gi, "");
  s = s.replace(/\bcopy\b/gi, "");
  s = s.replace(/\bv(?:er(?:sion)?)?\s*\d+\b/gi, "");
  // Common duplicate-file suffixes: "name (1)", "name (2)".
  s = s.replace(/\(\s*\d+\s*\)/g, "");
  s = s.replace(/\b\d+\b$/g, "");

  s = s.replace(/\s+/g, " ").trim();
  return titleCaseWords(s || base);
}

function isLeafValue(cell: string): boolean {
  const n = cell.trim().toLowerCase();
  return n === "leaf" || n === "l" || n === "work item" || n === "workitem";
}

function isParentValue(cell: string): boolean {
  const n = cell.trim().toLowerCase();
  return (
    n === "parent" ||
    n === "p" ||
    n === "summary" ||
    n === "header" ||
    n.startsWith("parent")
  );
}

function matrixToRecords(matrix: string[][]): {
  headers: string[];
  rows: RowRec[];
  headerRowIndex: number;
} | null {
  if (matrix.length < 2) {
    return null;
  }
  const headerRowIndex = detectHeaderRowIndex(matrix);
  const dataStartRow = headerRowIndex + 1;
  if (matrix.length < dataStartRow + 1) return null;

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

  const maxCols = headers.length;
  const rows: RowRec[] = [];
  for (let r = dataStartRow; r < matrix.length; r++) {
    const raw = matrix[r] ?? [];
    if (!raw.some((c) => String(c ?? "").trim() !== "")) continue;
    const o: RowRec = {};
    for (let j = 0; j < maxCols; j++) {
      o[headers[j]!] = raw[j] ?? "";
    }
    rows.push(o);
  }
  return { headers, rows, headerRowIndex };
}

function deriveProjectName(matrix: string[][], filename: string): string {
  void matrix;
  // Business rule: project identity always follows uploaded filename.
  return normalizeProjectNameFromFilename(filename);
}

function assignSequentialParents(
  parsed: Omit<RevaParsedRow, "parentTaskId">[]
): RevaParsedRow[] {
  let currentParentId: string | null = null;
  return parsed.map((r) => {
    if (r.nodeKind === "parent") {
      const row: RevaParsedRow = {
        ...r,
        parentTaskId: null,
      };
      currentParentId = r.taskId;
      return row;
    }
    return {
      ...r,
      parentTaskId: currentParentId,
    };
  });
}

function buildFullPath(
  taskId: string,
  byId: Map<string, RevaParsedRow>
): string {
  const chain: string[] = [];
  let cur: string | null = taskId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const r = byId.get(cur);
    if (!r) break;
    chain.unshift(r.taskName);
    cur = r.parentTaskId;
  }
  return chain.join(" > ");
}

export function parseRevaRecords(
  headers: string[],
  dataRows: RowRec[],
  projectName: string
): RevaParseResult {
  const errors: string[] = [];

  const taskIdCol = findColumn(headers, [
    "task id",
    "taskid",
    "task_id",
  ]);
  const taskNameCol = findColumn(headers, [
    "task names",
    "task name",
    "taskname",
    "description",
  ]);
  const parentLeafCol = findColumn(headers, [
    "parent/leaf",
    "parent leaf",
    "parentleaf",
    "node type",
    "type",
  ]);
  const totalCol = findColumn(headers, [
    "total qty (if any)",
    "total qty(if any)",
    "total quantity",
    "total qty",
    "total qty if any",
  ]);
  const progQtyCol = findColumn(headers, [
    "progress qty (if any)",
    "progress qty(if any)",
    "progress qty",
    "achieved quantity",
    "completed qty",
    "completed quantity",
    "actual quantity",
  ]);
  const progPctCol = findColumn(headers, [
    "progress percentage",
    "progress %",
    "percent complete",
    "% complete",
  ]);
  const unitCol = findColumn(headers, [
    "unit of measurement",
    "uom",
    "unit",
    "units",
  ]);
  const levelCol = findColumn(headers, [
    "level",
    "task level",
    "wbs level",
    "node level",
  ]);
  const levelCols = headers
    .filter((h) => /^level\s*[1-7]$/i.test(h))
    .sort((a, b) => {
      const ai = Number(a.replace(/\D/g, "")) || 0;
      const bi = Number(b.replace(/\D/g, "")) || 0;
      return ai - bi;
    });
  const parentIdCol = findColumn(headers, [
    "parent task id",
    "parent taskid",
    "parent id",
    "parent_id",
  ]);
  const startDateCol = findColumn(headers, [
    "start date",
    "planned start",
    "task start date",
    "baseline start",
  ]);
  const endDateCol = findColumn(headers, [
    "end date",
    "planned end",
    "finish date",
    "task end date",
    "baseline end",
  ]);

  if (!taskNameCol && levelCols.length === 0) {
    return {
      projectName,
      rows: [],
      leaves: [],
      errors: [
        ...errors,
        'Missing "Task Names" or "Level 1..7" columns for task naming.',
      ],
    };
  }
  if (!totalCol && !parentLeafCol) {
    return {
      projectName,
      rows: [],
      leaves: [],
      errors: [
        ...errors,
        'Missing quantity columns and "Parent/Leaf"; cannot identify leaf rows.',
      ],
    };
  }

  type Body = Omit<RevaParsedRow, "parentTaskId">;
  const bodies: Body[] = [];
  const explicitParentIds: (string | null)[] = [];
  const depths: (number | null)[] = [];
  const startDates: (string | null)[] = [];
  const endDates: (string | null)[] = [];
  let syntheticCounter = 0;

  for (const row of dataRows) {
    syntheticCounter += 1;
    const rowTaskId = taskIdCol ? String(row[taskIdCol] ?? "").trim() : "";
    const taskId = rowTaskId || `AUTO-${syntheticCounter}`;
    const pl = parentLeafCol ? String(row[parentLeafCol] ?? "").trim() : "";
    const totalQty = totalCol ? parseNumber(row[totalCol]) : 0;
    const unit = unitCol ? String(row[unitCol] ?? "").trim() : "";
    const hasQtyAndUnit = totalQty > 0 && unit.length > 0;

    let taskName = taskNameCol ? String(row[taskNameCol] ?? "").trim() : "";
    let depth: number | null = null;
    if (levelCols.length > 0) {
      for (let i = levelCols.length - 1; i >= 0; i--) {
        const col = levelCols[i]!;
        const v = String(row[col] ?? "").trim();
        if (v) {
          taskName = v;
          depth = i + 1;
          break;
        }
      }
    }
    if (depth == null && levelCol) {
      const levelRaw = String(row[levelCol] ?? "").trim().toLowerCase();
      const m = levelRaw.match(/l?\s*(\d+)/);
      if (m) depth = Number(m[1]);
    }
    if (!taskName) taskName = taskId;

    let nodeKind: "parent" | "leaf";
    if (parentLeafCol) {
      if (isLeafValue(pl)) nodeKind = "leaf";
      else if (isParentValue(pl)) nodeKind = "parent";
      else nodeKind = hasQtyAndUnit ? "leaf" : "parent";
    } else {
      nodeKind = hasQtyAndUnit ? "leaf" : "parent";
    }

    if (!parentLeafCol && !hasQtyAndUnit && levelCols.length === 0 && !levelCol) {
      continue;
    }

    if (!parentLeafCol && nodeKind === "parent" && !taskName.trim()) {
      continue;
    }
    if (parentLeafCol && !taskName.trim() && !rowTaskId) {
      continue;
    }

    if (!parentLeafCol && levelCols.length === 0 && !levelCol && !hasQtyAndUnit) {
      continue;
    }

    if (!parentLeafCol && !hasQtyAndUnit && !taskName) {
      continue;
    }

    if (!parentLeafCol && !hasQtyAndUnit && totalQty <= 0 && !taskName) {
      continue;
    }

    if (!parentLeafCol && !hasQtyAndUnit && !taskNameCol && levelCols.length === 0) {
      continue;
    }

    if (!parentLeafCol && !hasQtyAndUnit && !levelCol && levelCols.length === 0) {
      continue;
    }

    if (!parentLeafCol && !hasQtyAndUnit && !parentIdCol && !taskName) {
      continue;
    }

    if (!rowTaskId && taskIdCol) {
      errors.push(`Row ${syntheticCounter}: Task ID missing, auto-generated.`);
    }

    {
      const n = pl.toLowerCase();
      if (parentLeafCol && n.includes("leaf")) nodeKind = "leaf";
    }

    const progQty = progQtyCol ? parseNumber(row[progQtyCol]) : 0;
    let progressFromPercentColumn = false;
    let physicalProgressPct = 0;
    let actualQty = progQty;

    if (progPctCol) {
      const p = parseNumber(row[progPctCol]);
      if (p > 0 || String(row[progPctCol] ?? "").trim() !== "") {
        progressFromPercentColumn = true;
        physicalProgressPct = Math.min(100, Math.max(0, p));
        actualQty =
          totalQty > 0 ? (physicalProgressPct / 100) * totalQty : physicalProgressPct;
      }
    }

    if (!progressFromPercentColumn) {
      physicalProgressPct =
        totalQty > 0
          ? Math.min(100, Math.max(0, (actualQty / totalQty) * 100))
          : 0;
    }

    bodies.push({
      taskId,
      taskName: taskName || taskId,
      nodeKind,
      level: depth,
      totalQty,
      actualQty,
      physicalProgressPct,
      progressFromPercentColumn,
      unit,
    });
    explicitParentIds.push(
      parentIdCol ? String(row[parentIdCol] ?? "").trim() || null : null
    );
    depths.push(depth);
    startDates.push(startDateCol ? toIsoDate(row[startDateCol]) : null);
    endDates.push(endDateCol ? toIsoDate(row[endDateCol]) : null);
  }

  // Fallback: if Parent/Leaf typing was not reliably detected and we have levels,
  // infer parents by depth so non-deepest levels become parent rows.
  const numericDepths = depths.filter((d): d is number => d != null && d > 0);
  if (numericDepths.length > 0) {
    const maxDepth = Math.max(...numericDepths);
    const allLeafTyped = bodies.every((b) => b.nodeKind === "leaf");
    if (allLeafTyped && maxDepth > 1) {
      bodies.forEach((b, i) => {
        const d = depths[i] ?? null;
        if (d != null && d < maxDepth) b.nodeKind = "parent";
      });
    }
  }

  let withParents: RevaParsedRow[];
  if (parentIdCol) {
    withParents = bodies.map((b, i) => ({
      ...b,
      parentTaskId: explicitParentIds[i] ?? null,
    }));
  } else {
    const canUseDepth = depths.some((d) => d != null);
    if (canUseDepth) {
      const stack: string[] = [];
      withParents = bodies.map((b, i) => {
        const rawDepth = depths[i] ?? null;
        const depth = rawDepth != null && rawDepth > 0 ? rawDepth : stack.length + 1;
        const parentTaskId = depth > 1 ? stack[depth - 2] ?? null : null;
        stack[depth - 1] = b.taskId;
        stack.length = depth;
        return { ...b, parentTaskId };
      });
    } else {
      withParents = assignSequentialParents(bodies);
    }
  }

  const byId = new Map(withParents.map((r) => [r.taskId, r]));
  const usedIds = new Map<string, number>();
  const leaves: ParsedTask[] = withParents
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => r.nodeKind === "leaf")
    .map(({ r, idx }) => {
      const seen = usedIds.get(r.taskId) ?? 0;
      usedIds.set(r.taskId, seen + 1);
      const uniqueId = seen === 0 ? r.taskId : `${r.taskId}__${seen + 1}`;
      return {
        id: uniqueId,
        taskId: r.taskId,
        name: r.taskName,
        taskName: r.taskName,
        fullPath: buildFullPath(r.taskId, byId),
        unit: r.unit,
        actualQty: r.actualQty,
        totalQty: r.totalQty,
        physicalProgressPct: r.physicalProgressPct,
        progressFromPercentColumn: r.progressFromPercentColumn,
        nodeKind: "leaf" as const,
        parentTaskId: r.parentTaskId,
        startDate: startDates[idx] ?? null,
        endDate: endDates[idx] ?? null,
      };
    });

  return {
    projectName,
    rows: withParents,
    leaves,
    errors,
  };
}

function parseMatrix(matrix: string[][], filename: string): RevaParseResult {
  const projectName = deriveProjectName(matrix, filename);
  const parsed = matrixToRecords(matrix);
  if (!parsed || parsed.rows.length === 0) {
    return {
      projectName,
      rows: [],
      leaves: [],
      errors: [
        "Could not detect valid header/data rows. Ensure first 5 rows include headers like Task ID / Parent/Leaf / Task Names.",
      ],
    };
  }
  return parseRevaRecords(parsed.headers, parsed.rows, projectName);
}

export function parseRevaCsv(text: string, filename: string): RevaParseResult {
  const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: false });
  const matrix: string[][] = parsed.data.map((row) =>
    (row ?? []).map((c) => String(c ?? "").trim())
  );
  return parseMatrix(matrix, filename);
}

export function parseRevaXlsx(buffer: ArrayBuffer, filename: string): RevaParseResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array" });
  } catch (e) {
    return {
      projectName: deriveProjectName([], filename),
      rows: [],
      leaves: [],
      errors: [e instanceof Error ? e.message : "Could not read Excel file."],
    };
  }
  const sheet = wb.Sheets[wb.SheetNames[0]!]!;
  const aoa = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as (string | number | undefined)[][];
  const matrix = aoa.map((row) =>
    (row ?? []).map((c) => String(c ?? "").trim())
  );
  return parseMatrix(matrix, filename);
}
