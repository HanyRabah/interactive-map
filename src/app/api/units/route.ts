import { getProviderForProject } from "@/lib/crm";

export const dynamic = "force-dynamic";

// GET /api/units?projectId=zoya[&summary=1]
//   summary=1 returns cluster aggregates (fast, small — used by the masterplan lens)
//   otherwise returns the full unit list (used by floor-plans / drill-down)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) {
    return Response.json({ error: "projectId query param is required" }, { status: 400 });
  }

  // Routed per project: each project's CMS-configured CRM connection (or the global
  // default when it has none) answers for its own inventory.
  const provider = await getProviderForProject(projectId);

  if (url.searchParams.get("summary")) {
    const clusters = await provider.listClusters(projectId);
    return Response.json({ projectId, clusters }, { headers: { "Cache-Control": "no-store" } });
  }

  const units = await provider.listUnits(projectId);
  return Response.json({ projectId, units }, { headers: { "Cache-Control": "no-store" } });
}
