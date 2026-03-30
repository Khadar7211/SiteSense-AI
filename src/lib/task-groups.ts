/** Preserve first-seen order of Level 1 groups (typically file order). */
export function groupByLevel1Group<T extends { level1Group: string }>(
  items: T[]
): { level1Group: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  const order: string[] = [];
  for (const item of items) {
    const g = item.level1Group;
    if (!map.has(g)) {
      map.set(g, []);
      order.push(g);
    }
    map.get(g)!.push(item);
  }
  return order.map((level1Group) => ({
    level1Group,
    items: map.get(level1Group)!,
  }));
}

/** Level 1 → Level 2 → leaves (file order within buckets). */
export function groupByLevel1Level2<
  T extends { level1Group: string; level2Group?: string },
>(
  items: T[]
): {
  level1Group: string;
  sections: { level2Label: string; items: T[] }[];
}[] {
  const l1Map = new Map<
    string,
    { l2Order: (string | null)[]; l2Map: Map<string | null, T[]> }
  >();
  const l1Order: string[] = [];

  for (const item of items) {
    const l1 = item.level1Group;
    let bucket = l1Map.get(l1);
    if (!bucket) {
      bucket = { l2Order: [], l2Map: new Map() };
      l1Map.set(l1, bucket);
      l1Order.push(l1);
    }
    const l2 = item.level2Group ?? null;
    if (!bucket.l2Map.has(l2)) {
      bucket.l2Order.push(l2);
      bucket.l2Map.set(l2, []);
    }
    bucket.l2Map.get(l2)!.push(item);
  }

  return l1Order.map((l1) => {
    const b = l1Map.get(l1)!;
    return {
      level1Group: l1,
      sections: b.l2Order.map((l2) => ({
        level2Label: l2 === null ? "—" : l2,
        items: b.l2Map.get(l2)!,
      })),
    };
  });
}
