import { PROJECTS } from "@/data/projects";
import type { Project } from "@/data/projects";
import type { CatalogProvider } from "../provider";

// Reads the catalog straight from the in-repo PROJECTS array — today's reality, kept as
// the default adapter so nothing changes until a client actually needs to edit projects
// without a code deploy (that's when an edge-config or CMS adapter replaces this).
//
// clientSlug is derived from the developer name ("Hassan Allam" → "hassan-allam") since
// the in-repo data predates the Clients concept; CMS projects carry a real relationship.
function withClientSlug(p: Project): Project {
  return { ...p, clientSlug: p.clientSlug ?? p.developer.toLowerCase().replace(/[^a-z0-9]+/g, "-") };
}

export class CodeCatalogProvider implements CatalogProvider {
  readonly id = "code";

  async listProjects(): Promise<Project[]> {
    return PROJECTS.map(withClientSlug);
  }

  async getProject(id: string): Promise<Project | null> {
    const p = PROJECTS.find((proj) => proj.id === id);
    return p ? withClientSlug(p) : null;
  }
}
