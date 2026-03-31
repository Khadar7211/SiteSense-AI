import type { ParsedTask } from "@/types/progress";

export type MajorParentBucket = {
  key: string;
  displayLabel: string;
  tier: 1 | 2;
  leafIds: string[];
};

/** Pick major parent tier from WBS path: L2 bucket when depth allows, else L1. */
export function majorBucketKeyForLeaf(leaf: ParsedTask): {
  key: string;
  displayLabel: string;
  tier: 1 | 2;
} {
  const segments = leaf.fullPath
    .split(/\s*>\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const parentsOnly =
    segments.length > 1 ? segments.slice(0, -1) : ([] as string[]);

  if (parentsOnly.length >= 2) {
    return {
      key: `maj2:${parentsOnly[0]}>${parentsOnly[1]}`,
      displayLabel: parentsOnly[1]!,
      tier: 2,
    };
  }
  if (parentsOnly.length === 1) {
    return {
      key: `maj1:${parentsOnly[0]!}`,
      displayLabel: parentsOnly[0]!,
      tier: 1,
    };
  }
  return {
    key: `maj0:${leaf.id}`,
    displayLabel: leaf.name,
    tier: 1,
  };
}

export function computeMajorParentBuckets(leaves: ParsedTask[]): MajorParentBucket[] {
  const map = new Map<
    string,
    { displayLabel: string; tier: 1 | 2; leafIds: string[] }
  >();
  for (const leaf of leaves) {
    const { key, displayLabel, tier } = majorBucketKeyForLeaf(leaf);
    if (!map.has(key)) {
      map.set(key, { displayLabel, tier, leafIds: [] });
    }
    map.get(key)!.leafIds.push(leaf.id);
  }
  const rows = Array.from(map.entries()).map(([key, v]) => ({
    key,
    displayLabel: v.displayLabel,
    tier: v.tier,
    leafIds: v.leafIds,
  }));
  rows.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
  return rows;
}

/** Split one parent’s percent across leaves with cent-precision (same pattern as equal leaf split). */
export function splitParentPercentAmongLeaves(
  parentPercent: number,
  leafIds: string[]
): Record<string, number> {
  const n = leafIds.length;
  if (n === 0) return {};
  const totalBp = Math.round(parentPercent * 100);
  if (totalBp <= 0) {
    return Object.fromEntries(leafIds.map((id) => [id, 0]));
  }
  const baseBp = Math.floor(totalBp / n);
  const out: Record<string, number> = {};
  let sumBp = 0;
  leafIds.forEach((id, i) => {
    const bp = i === n - 1 ? totalBp - sumBp : baseBp;
    out[id] = bp / 100;
    sumBp += bp;
  });
  return out;
}

export function leafWeightsFromParentInputs(
  buckets: MajorParentBucket[],
  parentPct: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of buckets) {
    const p = parentPct[b.key] ?? 0;
    Object.assign(out, splitParentPercentAmongLeaves(p, b.leafIds));
  }
  return out;
}

export function totalParentWeightPct(
  buckets: MajorParentBucket[],
  parentPct: Record<string, number>
): number {
  return buckets.reduce((a, b) => a + (parentPct[b.key] ?? 0), 0);
}

export function parentWeightsFromDbLeafWeights(
  buckets: MajorParentBucket[],
  leaves: ParsedTask[],
  dbw: Record<string, number>
): Record<string, number> {
  const byId = new Map(leaves.map((l) => [l.id, l] as const));
  const out: Record<string, number> = {};
  for (const b of buckets) {
    let s = 0;
    for (const lid of b.leafIds) {
      const leaf = byId.get(lid);
      if (!leaf) continue;
      const v = dbw[leaf.taskId];
      if (v != null && Number.isFinite(v)) s += v;
    }
    out[b.key] = Math.round(s * 100) / 100;
  }
  return out;
}
