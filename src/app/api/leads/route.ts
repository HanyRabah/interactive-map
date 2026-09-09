import { getProviderForProject, provider } from "@/lib/crm";
import type { Lead } from "@/lib/crm/types";

export const dynamic = "force-dynamic";

// POST /api/leads — buyer submits an enquiry / viewing request from the map.
// Minimal validation only; the vendor adapter is the real authority on field shape.
// Server-side deliberately: the adapter for a real CRM will hold service credentials
// no client should ever see.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as (Partial<Lead> & { projectId?: string }) | null;
  if (!body) return Response.json({ error: "invalid JSON body" }, { status: 400 });

  const { contactName } = body;
  if (!contactName) {
    return Response.json({ error: "contactName is required" }, { status: 400 });
  }

  const lead: Lead = {
    contactName,
    email: body.email,
    phone: body.phone,
    unitId: body.unitId,
    message: body.message,
    shortlist: body.shortlist,
  };

  try {
    // projectId (optional) routes the lead into that project's CRM org.
    const p = body.projectId ? await getProviderForProject(body.projectId) : provider;
    const { id } = await p.createLead(lead);
    return Response.json({ id });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "provider error" }, { status: 502 });
  }
}
