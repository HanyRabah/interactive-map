// LMD's real project roster (lmd.com.eg/en/projects, checked 2026-08-05), grouped as they
// group it themselves. Only Zoya has real calibrated 3D/location data in this codebase —
// everything else is listed honestly as "coming soon", never given fabricated content.

export type LmdProjectStub = {
  id: string;
  name: string;
  country: "Egypt" | "UAE" | "Spain" | "Greece";
  /** Only set for projects with a real, calibrated interactive experience in this app. */
  href?: string;
};

export const LMD_PROJECTS: LmdProjectStub[] = [
  { id: "mindset", name: "Mindset", country: "Egypt" },
  { id: "8ight", name: "8ight", country: "Egypt" },
  { id: "zoya", name: "Zoya", country: "Egypt", href: "/" },
  { id: "one-ninety", name: "One Ninety", country: "Egypt" },
  { id: "3sixty", name: "3'Sixty", country: "Egypt" },
  { id: "layan", name: "Layan", country: "Egypt" },
  { id: "taiyo-residences", name: "Taiyo Residences", country: "UAE" },
  { id: "the-pier-residence", name: "The Pier Residence", country: "UAE" },
  { id: "rukan-community", name: "Rukan Community", country: "UAE" },
  { id: "muntaner-91", name: "Muntaner 91", country: "Spain" },
  { id: "karaiskaki-15", name: "Karaiskaki 15", country: "Greece" },
];
