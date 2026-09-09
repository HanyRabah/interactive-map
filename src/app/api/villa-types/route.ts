import { getProviderForProject } from "@/lib/crm";
import { listVillaTypes, saveVillaTypePolygon } from "@/lib/villaTypes";

export const dynamic = "force-dynamic";

// GET  /api/villa-types?projectId=zoya-ghazala-bay
//   The masterplan's interactive zones: CMS content (render, size, bedroom line, outline)
//   joined to live CRM availability per product. One request, because the map needs both to
//   draw a single hover card and splitting it would flash a card with no numbers.
//
// POST /api/villa-types   { code, polygon, secret }
//   Saves an outline drawn with the in-app ?tools=1 tool. Same TOOLS_ADMIN_SECRET gate the
//   imagery flags use — this writes to the CMS, so it can't be open.
export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) {
    return Response.json({ error: "projectId query param is required" }, { status: 400 });
  }

  const types = await listVillaTypes(projectId);

  // Availability is best-effort: an org that hasn't adopted Villa_Type__c (or is simply
  // down) should still get the zones, cards and outlines — just without live numbers.
  let byCode = new Map<string, { total: number; available: number; availableUnitIds: string[] }>();
  try {
    const provider = await getProviderForProject(projectId);
    const summaries = await provider.listVillaTypes(projectId);
    byCode = new Map(summaries.map((s) => [s.villaType, s]));
  } catch (err) {
    console.warn(`[villa-types] availability unavailable for ${projectId}:`, err);
  }

  const villaTypes = types.map((t) => {
    const a = byCode.get(t.code);
    return {
      ...t,
      total: a?.total ?? 0,
      available: a?.available ?? 0,
      // Capped: the enquiry form offers a pick-list, and a hundred unit numbers in a
      // dropdown helps nobody. The count above stays the true figure.
      availableUnitIds: a?.availableUnitIds.slice(0, 40) ?? [],
    };
  });

  return Response.json({ projectId, villaTypes }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { code, polygon, secret } = (await request.json().catch(() => ({}))) as {
    code?: string;
    polygon?: unknown;
    secret?: string;
  };

  if (!process.env.TOOLS_ADMIN_SECRET || secret !== process.env.TOOLS_ADMIN_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!code) return Response.json({ error: "code is required" }, { status: 400 });

  const ring = Array.isArray(polygon)
    ? polygon.filter(
        (p): p is [number, number] =>
          Array.isArray(p) && p.length === 2 && typeof p[0] === "number" && typeof p[1] === "number"
      )
    : [];
  // An empty array is a legitimate request — it's how the tool clears a zone it drew wrong.
  if (Array.isArray(polygon) && polygon.length > 0 && ring.length < 3) {
    return Response.json({ error: "polygon must be at least 3 [lng, lat] pairs" }, { status: 400 });
  }

  const saved = await saveVillaTypePolygon(code, ring);
  if (!saved) return Response.json({ error: `no villa type with code "${code}"` }, { status: 404 });
  return Response.json({ code, points: ring.length });
}
