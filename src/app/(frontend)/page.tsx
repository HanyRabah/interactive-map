import ZoyaShowcase from "@/components/ZoyaShowcase";
import { buildClientBrand } from "@/lib/clientBrand";

export const dynamic = "force-dynamic";

// The bare domain is LMD's experience (today's flagship client) — same catalog-driven
// brand as /lmd, so the admin panel controls this roster too. Falls back to the
// component's built-in LMD default if the catalog has no LMD client yet (fresh DB).
export default async function Home() {
  const brand = await buildClientBrand("lmd");
  return brand ? <ZoyaShowcase brand={brand} /> : <ZoyaShowcase />;
}
