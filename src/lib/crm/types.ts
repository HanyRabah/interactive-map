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
  /** Display-name of the cluster/phase the unit belongs to ("Lagoon Residences"). */
  cluster: string;
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
