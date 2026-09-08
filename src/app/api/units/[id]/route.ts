import { getProviderForProject, provider } from "@/lib/crm";

export const dynamic = "force-dynamic";

// GET /api/units/<unitId>[?projectId=…] — projectId routes to that project's CRM;
// without it the global default answers (fine pre-CMS, ambiguous once orgs multiply,
// so the map should always pass it).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const projectId = new URL(req.url).searchParams.get("projectId");
  const p = projectId ? await getProviderForProject(projectId) : provider;
  const unit = await p.getUnit(id);
  if (!unit) return Response.json({ error: "unit not found" }, { status: 404 });
  return Response.json({ unit }, { headers: { "Cache-Control": "no-store" } });
}
