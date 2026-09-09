// Canonical schema the map consumes internally. No vendor field names appear here — a
// SalesforceProvider or SapProvider translates its own object model into these shapes
// before returning. Kept intentionally narrow: only what the map actually renders and
// submits today. Widen it as real features land (e.g. amenity distance, floor plan URL),
// not speculatively.

export type UnitStatus = "available" | "reserved" | "sold";

export type Money = {
  amount: number;
  /** ISO 4217 (EGP, AED, USD, …). */
  currency: string;
};

export type Unit = {
  id: string;
  projectId: string;
  /** Display-name of the area/phase the unit belongs to ("Sea Vil"). */
  cluster: string;
  /**
   * Which product this unit is — the join key into the CMS villaTypes collection, which
   * carries the render, size and bedroom line. Absent on units whose org hasn't adopted the
   * field, which is why every consumer treats it as optional rather than assuming it.
   */
  villaType?: string;
  status: UnitStatus;
  price?: Money;
  bedrooms?: number;
  areaSqm?: number;
};

/** Aggregate view surfaced on the masterplan by the "availability" lens. */
export type ClusterSummary = {
  cluster: string;
  total: number;
  available: number;
};

/** Availability rolled up per product, for the villa-type hover cards. */
export type VillaTypeSummary = {
  villaType: string;
  cluster: string;
  total: number;
  available: number;
  /** Unit numbers a buyer can actually enquire about, so the form can offer a real choice. */
  availableUnitIds: string[];
};

export type Lead = {
  contactName: string;
  email?: string;
  phone?: string;
  /** The unit the buyer clicked "enquire" from, if any. */
  unitId?: string;
  message?: string;
  /** Snapshot of the buyer's shortlist at the moment they submitted. */
  shortlist?: string[];
};

export type Shortlist = {
  contactId: string;
  unitIds: string[];
};
