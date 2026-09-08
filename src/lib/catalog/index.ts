import type { CatalogProvider } from "./provider";
import { CodeCatalogProvider } from "./providers/code";
import { CmsCatalogProvider } from "./providers/cms";

// Same pattern as src/lib/crm: one env var picks the adapter at module load, and a
// declared-but-unimplemented backend fails loudly instead of silently serving the
// in-repo data as if it were the client's CMS.
function pickProvider(): CatalogProvider {
  const kind = process.env.CATALOG_PROVIDER ?? "code";
  if (kind === "code") return new CodeCatalogProvider();
  if (kind === "cms") return new CmsCatalogProvider();
  if (kind === "edge-config") {
    throw new Error(
      `CATALOG_PROVIDER="edge-config" is declared but no adapter is implemented yet. ` +
      `Add src/lib/catalog/providers/edge-config.ts implementing CatalogProvider, then wire it here.`
    );
  }
  throw new Error(`Unknown CATALOG_PROVIDER="${kind}". Expected "code", "edge-config", or "cms".`);
}

export const catalog: CatalogProvider = pickProvider();

export type { CatalogProvider } from "./provider";
