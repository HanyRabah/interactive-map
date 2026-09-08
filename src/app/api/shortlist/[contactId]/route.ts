import { provider } from "@/lib/crm";

export const dynamic = "force-dynamic";

// GET /api/shortlist/<contactId> — read a buyer's saved units.
export async function GET(_req: Request, ctx: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await ctx.params;
  const shortlist = await provider.getShortlist(contactId);
  return Response.json({ shortlist }, { headers: { "Cache-Control": "no-store" } });
}

// PUT /api/shortlist/<contactId> — replace the buyer's saved units.
// Client sends { unitIds: string[] }; the server stores the full set (no diff/patch).
// Keeping it a whole-set replace is simpler than merging with vendor state and avoids
// races between the map and a rep editing the same contact simultaneously.
export async function PUT(request: Request, ctx: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { unitIds?: unknown } | null;
  if (!body || !Array.isArray(body.unitIds) || !body.unitIds.every((x) => typeof x === "string")) {
    return Response.json({ error: "body must be { unitIds: string[] }" }, { status: 400 });
  }
  try {
    await provider.saveShortlist(contactId, body.unitIds as string[]);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "provider error" }, { status: 502 });
  }
}
