import type { ClusterSummary, Lead, Shortlist, Unit, VillaTypeSummary } from "./types";

// The one contract every CRM/ERP adapter implements. The rest of the app imports the
// provider singleton (see ./index.ts) and never touches Salesforce/SAP field names.
// Adding a new client == writing one file that implements this interface.
export interface InventoryProvider {
  /** Human-readable id ("mock", "salesforce", "sap") — surfaced in /api/health and logs. */
  readonly id: string;

  listUnits(projectId: string): Promise<Unit[]>;
  getUnit(unitId: string): Promise<Unit | null>;
  /** Fast summary for masterplan cluster labels; adapters may aggregate server-side. */
  listClusters(projectId: string): Promise<ClusterSummary[]>;
  /** Availability per product, keyed by the CMS villaTypes `code`, for the hover cards. */
  listVillaTypes(projectId: string): Promise<VillaTypeSummary[]>;

  createLead(lead: Lead): Promise<{ id: string }>;

  getShortlist(contactId: string): Promise<Shortlist>;
  saveShortlist(contactId: string, unitIds: string[]): Promise<void>;
}
