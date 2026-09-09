import type { InventoryProvider } from "../provider";
import type { ClusterSummary, Lead, Shortlist, Unit, VillaTypeSummary } from "../types";
import { rollUpClusters, rollUpVillaTypes } from "../rollup";

// In-memory demo dataset — not persisted anywhere. Enough to make the masterplan's
// availability lens, cluster labels, and shortlist behaviors render believably in a
// pitch, without pretending we're connected to a real CRM. Real numbers per project
// will come from the vendor adapter once wired.
//
// Egyptian pounds because Zoya is an Egyptian project; UAE projects would swap to AED
// via the currency field, without any schema change.

type ClusterSeed = {
  cluster: string;
  /** Matches a CMS villaTypes `code` — the mock stands in for a real org, so it carries the
   *  same join key a real Unit__c.Villa_Type__c would. */
  villaType: string;
  count: number;
  bedrooms: number;
  areaSqm: number;
  priceFrom: number;
  currency: string;
  availableRate: number; // 0..1 — share of units left available
  reservedRate: number;  // 0..1 — share reserved (rest sold)
};

// Zoya's real product mix: 3 masterplan areas, 18 products, sourced from LMD's own
// sub-project pages. Counts and prices are demo figures — the names, sizes and areas are
// not. Availability rates are fixed per product so the same unit never flips status
// between reloads; a demo that changes under the client reads as broken, not lively.
const ZOYA_SEEDS: ClusterSeed[] = [
  { cluster: "Sea Vil", villaType: "sea-vil-shoreline-villa-basement-945", count: 6, bedrooms: 6, areaSqm: 945, priceFrom: 89800000, currency: "EGP", availableRate: 0.55, reservedRate: 0.15 },
  { cluster: "Sea Vil", villaType: "sea-vil-shoreline-villa-basement-920", count: 6, bedrooms: 5, areaSqm: 920, priceFrom: 87400000, currency: "EGP", availableRate: 0.30, reservedRate: 0.25 },
  { cluster: "Sea Vil", villaType: "sea-vil-sea-view-villas-520", count: 10, bedrooms: 4, areaSqm: 520, priceFrom: 44200000, currency: "EGP", availableRate: 0.45, reservedRate: 0.20 },
  { cluster: "Sea Vil", villaType: "sea-vil-sea-shades-villas-375", count: 14, bedrooms: 5, areaSqm: 375, priceFrom: 27000000, currency: "EGP", availableRate: 0.65, reservedRate: 0.10 },
  { cluster: "Isle Vil", villaType: "isle-vil-shoreline-villa-494", count: 10, bedrooms: 5, areaSqm: 494, priceFrom: 42000000, currency: "EGP", availableRate: 0.35, reservedRate: 0.30 },
  { cluster: "Isle Vil", villaType: "isle-vil-horizon-villa-300", count: 14, bedrooms: 4, areaSqm: 300, priceFrom: 21600000, currency: "EGP", availableRate: 0.50, reservedRate: 0.15 },
  { cluster: "Isle Vil", villaType: "isle-vil-town-casa-a-villa-248", count: 18, bedrooms: 3, areaSqm: 248, priceFrom: 17900000, currency: "EGP", availableRate: 0.40, reservedRate: 0.25 },
  { cluster: "Isle Vil", villaType: "isle-vil-twin-casa-b-villa-248", count: 18, bedrooms: 3, areaSqm: 248, priceFrom: 17900000, currency: "EGP", availableRate: 0.60, reservedRate: 0.10 },
  { cluster: "Isle Vil", villaType: "isle-vil-coconut-condo-130", count: 22, bedrooms: 5, areaSqm: 130, priceFrom: 8400000, currency: "EGP", availableRate: 0.55, reservedRate: 0.15 },
  { cluster: "Isle Vil", villaType: "isle-vil-twin-palm-condo-180", count: 18, bedrooms: 3, areaSqm: 180, priceFrom: 11700000, currency: "EGP", availableRate: 0.30, reservedRate: 0.25 },
  { cluster: "Isle Vil", villaType: "isle-vil-palm-condo-170", count: 22, bedrooms: 3, areaSqm: 170, priceFrom: 11000000, currency: "EGP", availableRate: 0.45, reservedRate: 0.20 },
  { cluster: "Isle Vil", villaType: "isle-vil-twin-palm-condo-235", count: 18, bedrooms: 3, areaSqm: 235, priceFrom: 16900000, currency: "EGP", availableRate: 0.65, reservedRate: 0.10 },
  { cluster: "Isle Vil", villaType: "isle-vil-town-casa-230", count: 18, bedrooms: 4, areaSqm: 230, priceFrom: 16600000, currency: "EGP", availableRate: 0.35, reservedRate: 0.30 },
  { cluster: "Isle Vil", villaType: "isle-vil-town-casa-235", count: 18, bedrooms: 4, areaSqm: 235, priceFrom: 16900000, currency: "EGP", availableRate: 0.50, reservedRate: 0.15 },
  { cluster: "Coconut Condo", villaType: "coconut-condo-130", count: 22, bedrooms: 3, areaSqm: 130, priceFrom: 8400000, currency: "EGP", availableRate: 0.40, reservedRate: 0.25 },
  { cluster: "Coconut Condo", villaType: "coconut-condo-p1-110", count: 22, bedrooms: 2, areaSqm: 110, priceFrom: 7200000, currency: "EGP", availableRate: 0.60, reservedRate: 0.10 },
  { cluster: "Coconut Condo", villaType: "coconut-condo-p2-100", count: 22, bedrooms: 2, areaSqm: 100, priceFrom: 6500000, currency: "EGP", availableRate: 0.55, reservedRate: 0.15 },
  { cluster: "Coconut Condo", villaType: "coconut-condo-p3-110", count: 22, bedrooms: 2, areaSqm: 110, priceFrom: 7200000, currency: "EGP", availableRate: 0.30, reservedRate: 0.25 },
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
        id: `${seed.villaType}-${String(i + 1).padStart(3, "0")}`,
        projectId,
        cluster: seed.cluster,
        villaType: seed.villaType,
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
    return rollUpClusters(this.unitsFor(projectId));
  }

  async listVillaTypes(projectId: string): Promise<VillaTypeSummary[]> {
    return rollUpVillaTypes(this.unitsFor(projectId));
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
