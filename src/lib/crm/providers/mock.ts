import type { InventoryProvider } from "../provider";
import type { ClusterSummary, Lead, Shortlist, Unit } from "../types";

// In-memory demo dataset — not persisted anywhere. Enough to make the masterplan's
// availability lens, cluster labels, and shortlist behaviors render believably in a
// pitch, without pretending we're connected to a real CRM. Real numbers per project
// will come from the vendor adapter once wired.
//
// Egyptian pounds because Zoya is an Egyptian project; UAE projects would swap to AED
// via the currency field, without any schema change.

type ClusterSeed = {
  cluster: string;
  count: number;
  bedrooms: number;
  areaSqm: number;
  priceFrom: number;
  currency: string;
  availableRate: number; // 0..1 — share of units left available
  reservedRate: number;  // 0..1 — share reserved (rest sold)
};

const ZOYA_SEEDS: ClusterSeed[] = [
  { cluster: "Coastal Villas",   count: 24, bedrooms: 5, areaSqm: 420, priceFrom: 45_000_000, currency: "EGP", availableRate: 0.30, reservedRate: 0.15 },
  { cluster: "Lagoon Residences", count: 48, bedrooms: 3, areaSqm: 180, priceFrom: 12_000_000, currency: "EGP", availableRate: 0.55, reservedRate: 0.20 },
  { cluster: "Marina Apartments", count: 60, bedrooms: 2, areaSqm: 110, priceFrom: 7_500_000,  currency: "EGP", availableRate: 0.65, reservedRate: 0.15 },
  { cluster: "Golf Chalets",      count: 32, bedrooms: 4, areaSqm: 260, priceFrom: 22_000_000, currency: "EGP", availableRate: 0.40, reservedRate: 0.25 },
];

function statusFor(index: number, seed: ClusterSeed): Unit["status"] {
  // Deterministic distribution (no Math.random) so unit statuses are stable across
  // requests and page reloads — a demo where the same unit flips available/sold each
  // refresh reads as broken, not lively.
  const availCount = Math.round(seed.count * seed.availableRate);
  const resvCount = Math.round(seed.count * seed.reservedRate);
  if (index < availCount) return "available";
  if (index < availCount + resvCount) return "reserved";
  return "sold";
}

function priceFor(index: number, seed: ClusterSeed): number {
  // Small deterministic spread around priceFrom so units within a cluster aren't
  // identically priced. ~15% band.
  const jitter = ((index * 37) % 15) / 100;
  return Math.round(seed.priceFrom * (1 + jitter));
}

function generateUnits(projectId: string, seeds: ClusterSeed[]): Unit[] {
  const units: Unit[] = [];
  for (const seed of seeds) {
    for (let i = 0; i < seed.count; i++) {
      units.push({
        id: `${projectId}-${seed.cluster.toLowerCase().replace(/\s+/g, "-")}-${String(i + 1).padStart(3, "0")}`,
        projectId,
        cluster: seed.cluster,
        status: statusFor(i, seed),
        price: { amount: priceFor(i, seed), currency: seed.currency },
        bedrooms: seed.bedrooms,
        areaSqm: seed.areaSqm,
      });
    }
  }
  return units;
}

const SEEDS_BY_PROJECT: Record<string, ClusterSeed[]> = {
  zoya: ZOYA_SEEDS,
  "zoya-ghazala-bay": ZOYA_SEEDS,
};

// Shortlists live in a plain in-memory map — replaces itself on server restart, which
// is fine for the demo. A real provider persists to the CRM's contact record.
const shortlists = new Map<string, Set<string>>();

export class MockProvider implements InventoryProvider {
  readonly id = "mock";

  private unitsCache = new Map<string, Unit[]>();

  private unitsFor(projectId: string): Unit[] {
    const cached = this.unitsCache.get(projectId);
    if (cached) return cached;
    const seeds = SEEDS_BY_PROJECT[projectId] ?? [];
    const units = generateUnits(projectId, seeds);
    this.unitsCache.set(projectId, units);
    return units;
  }

  async listUnits(projectId: string): Promise<Unit[]> {
    return this.unitsFor(projectId);
  }

  async getUnit(unitId: string): Promise<Unit | null> {
    // The mock's unit ids embed the project slug, so we can locate a unit without
    // needing the projectId separately.
    const [projectId] = unitId.split("-", 1);
    return this.unitsFor(projectId).find((u) => u.id === unitId) ?? null;
  }

  async listClusters(projectId: string): Promise<ClusterSummary[]> {
    const units = this.unitsFor(projectId);
    const byCluster = new Map<string, { total: number; available: number }>();
    for (const u of units) {
      const entry = byCluster.get(u.cluster) ?? { total: 0, available: 0 };
      entry.total += 1;
      if (u.status === "available") entry.available += 1;
      byCluster.set(u.cluster, entry);
    }
    return Array.from(byCluster, ([cluster, v]) => ({ cluster, ...v }));
  }

  async createLead(lead: Lead): Promise<{ id: string }> {
    // Not persisted — just a stable-shaped id so downstream code (email confirmations,
    // rep notifications) can be wired without the CRM actually being connected yet.
    const id = `LEAD-${(lead.email || lead.contactName).replace(/[^a-z0-9]/gi, "").slice(0, 12).toUpperCase()}-${Date.now().toString(36)}`;
    return { id };
  }

  async getShortlist(contactId: string): Promise<Shortlist> {
    const set = shortlists.get(contactId) ?? new Set<string>();
    return { contactId, unitIds: Array.from(set) };
  }

  async saveShortlist(contactId: string, unitIds: string[]): Promise<void> {
    shortlists.set(contactId, new Set(unitIds));
  }
}
