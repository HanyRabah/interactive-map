import type { InventoryProvider } from "./provider";
import { MockProvider } from "./providers/mock";
import { SalesforceProvider, salesforceConfigFromEnv } from "./providers/salesforce";

// Two layers of routing:
//
// 1. GLOBAL DEFAULT (`provider`) — picked once from CRM_PROVIDER at module load, exactly
//    as before the CMS existed. "salesforce" here reads the SF_* env vars. This is what
//    projects without their own CRM config (all the in-repo ones) fall back to.
//
// 2. PER-PROJECT (`getProviderForProject`) — the multi-tenant path. Looks up the
//    project's `crm` config from the catalog (set in the /admin panel) and returns a
//    provider connected to THAT org: Zoya can point at LMD's Salesforce while Bayn
//    points at ORA's. Instances are cached per project so tokens are reused.
function pickGlobalProvider(): InventoryProvider {
  const kind = process.env.CRM_PROVIDER ?? "mock";
  if (kind === "mock") return new MockProvider();
  if (kind === "salesforce") return new SalesforceProvider(salesforceConfigFromEnv());
  if (kind === "sap") {
    throw new Error(
      `CRM_PROVIDER="sap" is declared but no adapter is implemented yet. ` +
      `Add src/lib/crm/providers/sap.ts implementing InventoryProvider, then wire it here.`
    );
  }
  throw new Error(`Unknown CRM_PROVIDER="${kind}". Expected "mock", "salesforce", or "sap".`);
}

export const provider: InventoryProvider = pickGlobalProvider();

const perProjectCache = new Map<string, InventoryProvider>();

export async function getProviderForProject(projectId: string): Promise<InventoryProvider> {
  const cached = perProjectCache.get(projectId);
  if (cached) return cached;

  // Late import: catalog's cms adapter loads Payload, which must never be pulled into
  // module-load paths that run before env/config is ready.
  const { catalog } = await import("@/lib/catalog");
  const project = await catalog.getProject(projectId);
  const crm = project?.crm;

  let resolved: InventoryProvider;
  if (!crm) {
    resolved = provider; // no per-project config → global default (pre-CMS behavior)
  } else if (crm.provider === "mock") {
    resolved = new MockProvider();
  } else if (crm.provider === "salesforce") {
    resolved = new SalesforceProvider({
      instanceUrl: crm.instanceUrl,
      clientId: crm.clientId,
      clientSecret: crm.clientSecret,
      currency: crm.currency,
      externalProjectId: () => crm.externalProjectId,
    });
  } else {
    throw new Error(`Project "${projectId}" is configured for CRM provider "${crm.provider}", which has no adapter yet.`);
  }

  perProjectCache.set(projectId, resolved);
  return resolved;
}

/** Drop a cached per-project provider — call after its CRM config changes in the CMS. */
export function invalidateProviderForProject(projectId: string): void {
  perProjectCache.delete(projectId);
}

export type { InventoryProvider } from "./provider";
export * from "./types";
