import type { ClusterSummary, Unit, VillaTypeSummary } from "./types";

// Aggregation shared by every adapter. Lives here rather than in each provider because a
// mock and a real org disagreeing on what "available" counts as is the kind of bug that
// only shows up in front of a client.

export function rollUpClusters(units: Unit[]): ClusterSummary[] {
  const by = new Map<string, { total: number; available: number }>();
  for (const u of units) {
    const e = by.get(u.cluster) ?? { total: 0, available: 0 };
    e.total++;
    if (u.status === "available") e.available++;
    by.set(u.cluster, e);
  }
  return Array.from(by, ([cluster, v]) => ({ cluster, ...v }));
}

export function rollUpVillaTypes(units: Unit[]): VillaTypeSummary[] {
  const by = new Map<string, VillaTypeSummary>();
  for (const u of units) {
    // A unit with no villaType belongs to an org that hasn't adopted the field. Skipping it
    // keeps the hover cards honest: better a type with no units than a phantom "" bucket.
    if (!u.villaType) continue;
    const e = by.get(u.villaType) ?? {
      villaType: u.villaType,
      cluster: u.cluster,
      total: 0,
      available: 0,
      availableUnitIds: [],
    };
    e.total++;
    if (u.status === "available") {
      e.available++;
      e.availableUnitIds.push(u.id);
    }
    by.set(u.villaType, e);
  }
  return Array.from(by.values());
}
