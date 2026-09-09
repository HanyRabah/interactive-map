import type { InventoryProvider } from "../provider";
import type { ClusterSummary, Lead, Shortlist, Unit, UnitStatus, VillaTypeSummary } from "../types";
import { rollUpClusters, rollUpVillaTypes } from "../rollup";

// Real Salesforce adapter, built for the showcase org (see docs/salesforce/setup.md for
// the org-side setup: Unit__c custom object, Connected App with the Client Credentials
// flow, seed CSV import). Server-side only — the client secret lives in env vars or the
// CMS (admin-only), and every call happens inside API routes, never in the browser bundle.
//
// Config comes from the constructor — one instance per connected org, so different
// projects can point at different clients' Salesforce orgs (see getProviderForProject in
// ../index.ts). fromEnv() builds the global-default instance from:
//   SF_INSTANCE_URL   https://<your-org>.my.salesforce.com  (My Domain URL, no trailing /)
//   SF_CLIENT_ID      Connected App consumer key
//   SF_CLIENT_SECRET  Connected App consumer secret
//   SF_CURRENCY       display currency for Price__c (defaults to USD — a Dev Edition
//                     org's default; set EGP/AED if you changed the org currency)

const API_VERSION = "v62.0";

export type SalesforceConfig = {
  instanceUrl: string;
  clientId: string;
  clientSecret: string;
  /** Display currency for Price__c (the org's currency). */
  currency?: string;
  /**
   * Maps the map's projectId → the org's Project_Id__c value. A client's org may key
   * units by its own codes ("BAYN-GH01") rather than our slugs; identity when omitted.
   */
  externalProjectId?: (projectId: string) => string;
};

type SfUnitRecord = {
  Name: string;
  Project_Id__c: string;
  Cluster__c: string;
  Villa_Type__c?: string | null;
  Status__c: string;
  Price__c: number | null;
  Bedrooms__c: number | null;
  Area_Sqm__c: number | null;
};

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`SalesforceProvider: missing env var ${name} (see docs/salesforce/setup.md)`);
  return v;
}

/** Global-default instance config, read from SF_* env vars (the pre-CMS single-org mode). */
export function salesforceConfigFromEnv(): SalesforceConfig {
  return {
    instanceUrl: env("SF_INSTANCE_URL"),
    clientId: env("SF_CLIENT_ID"),
    clientSecret: env("SF_CLIENT_SECRET"),
    currency: process.env.SF_CURRENCY,
  };
}

/** SOQL string literal escape — quotes and backslashes only; SOQL has no other escapes in literals. */
function soqlEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function toStatus(raw: string | null | undefined): UnitStatus {
  const s = (raw ?? "").toLowerCase();
  if (s === "reserved") return "reserved";
  if (s === "sold") return "sold";
  return "available";
}

export class SalesforceProvider implements InventoryProvider {
  readonly id = "salesforce";

  constructor(private config: SalesforceConfig) {}

  // Access token cached until Salesforce rejects it (~2h sessions by default); on a 401
  // we refresh once and retry rather than tracking expiry client-side.
  private token: string | null = null;

  private async fetchToken(): Promise<string> {
    const res = await fetch(`${this.config.instanceUrl}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });
    if (!res.ok) throw new Error(`Salesforce token request failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { access_token: string };
    this.token = data.access_token;
    return data.access_token;
  }

  /** Authenticated call with one automatic re-auth retry on 401. */
  private async sf(path: string, init?: RequestInit): Promise<Response> {
    const call = async (token: string) =>
      fetch(`${this.config.instanceUrl}${path}`, {
        ...init,
        headers: { ...init?.headers, Authorization: `Bearer ${token}` },
      });

    let res = await call(this.token ?? (await this.fetchToken()));
    if (res.status === 401) res = await call(await this.fetchToken());
    return res;
  }

  private async query<T>(soql: string): Promise<T[]> {
    const res = await this.sf(`/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`);
    if (!res.ok) throw new Error(`Salesforce query failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { records: T[]; done: boolean; nextRecordsUrl?: string };
    // Showcase orgs hold a few hundred units; a real multi-thousand-unit org would follow
    // nextRecordsUrl pages here.
    return data.records;
  }

  // Villa_Type__c is the join key to the CMS's villa types, but it's a field WE asked the
  // client to add — an org that hasn't added it yet must keep working, showing area-level
  // availability without the per-product breakdown, rather than 500ing the whole map. So the
  // field is queried optimistically and dropped on the org's own INVALID_FIELD complaint;
  // the flag flips back the moment the field appears, with no redeploy.
  private villaTypeFieldMissing = false;

  private unitFields(): string {
    const base = "Name, Project_Id__c, Cluster__c, Status__c, Price__c, Bedrooms__c, Area_Sqm__c";
    return this.villaTypeFieldMissing ? base : `${base}, Villa_Type__c`;
  }

  private async queryUnits(where: string): Promise<SfUnitRecord[]> {
    try {
      return await this.query<SfUnitRecord>(`SELECT ${this.unitFields()} FROM Unit__c WHERE ${where}`);
    } catch (err) {
      if (this.villaTypeFieldMissing || !/No such column 'Villa_Type__c'/.test(String(err))) throw err;
      console.warn(
        "[salesforce] Unit__c has no Villa_Type__c field — falling back to area-level availability. " +
          "Add the field and import the villa-type units to enable the per-villa hover cards."
      );
      this.villaTypeFieldMissing = true;
      return this.query<SfUnitRecord>(`SELECT ${this.unitFields()} FROM Unit__c WHERE ${where}`);
    }
  }

  private mapUnit(r: SfUnitRecord): Unit {
    return {
      id: r.Name,
      projectId: r.Project_Id__c,
      cluster: r.Cluster__c,
      villaType: r.Villa_Type__c ?? undefined,
      status: toStatus(r.Status__c),
      price: r.Price__c != null ? { amount: r.Price__c, currency: this.config.currency ?? "USD" } : undefined,
      bedrooms: r.Bedrooms__c ?? undefined,
      areaSqm: r.Area_Sqm__c ?? undefined,
    };
  }

  async listUnits(projectId: string): Promise<Unit[]> {
    const externalId = this.config.externalProjectId?.(projectId) ?? projectId;
    const records = await this.queryUnits(`Project_Id__c = '${soqlEscape(externalId)}' ORDER BY Name`);
    return records.map((r) => this.mapUnit(r));
  }

  async getUnit(unitId: string): Promise<Unit | null> {
    const records = await this.queryUnits(`Name = '${soqlEscape(unitId)}' LIMIT 1`);
    return records.length ? this.mapUnit(records[0]) : null;
  }

  async listClusters(projectId: string): Promise<ClusterSummary[]> {
    return rollUpClusters(await this.listUnits(projectId));
  }

  async listVillaTypes(projectId: string): Promise<VillaTypeSummary[]> {
    return rollUpVillaTypes(await this.listUnits(projectId));
  }

  async createLead(lead: Lead): Promise<{ id: string }> {
    // Standard Lead object. Company is required by Salesforce — for a consumer real-estate
    // enquiry there is no company, so the conventional placeholder is the lead's own name.
    const description = [
      lead.message,
      lead.unitId && `Unit: ${lead.unitId}`,
      lead.shortlist?.length && `Shortlist: ${lead.shortlist.join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n");

    const res = await this.sf(`/services/data/${API_VERSION}/sobjects/Lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        LastName: lead.contactName,
        Company: lead.contactName,
        Email: lead.email,
        Phone: lead.phone,
        Description: description || undefined,
        LeadSource: "DP Interactive",
      }),
    });
    if (!res.ok) throw new Error(`Salesforce lead create failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { id: string };
    return { id: data.id };
  }

  // Shortlists stay in-memory for the showcase — syncing them to a Contact-linked custom
  // object is the phase-3 write integration (see the ORA proposal's build plan), and the
  // showcase demo doesn't need it: the impressive moments are live availability and the
  // lead landing in Salesforce.
  private shortlists = new Map<string, Set<string>>();

  async getShortlist(contactId: string): Promise<Shortlist> {
    const set = this.shortlists.get(contactId) ?? new Set<string>();
    return { contactId, unitIds: Array.from(set) };
  }

  async saveShortlist(contactId: string, unitIds: string[]): Promise<void> {
    this.shortlists.set(contactId, new Set(unitIds));
  }
}
