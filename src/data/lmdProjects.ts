// LMD's real project roster (lmd.com.eg/en/projects, checked 2026-08-05), grouped as they
// group it themselves. Only Zoya has real calibrated 3D/location data in this codebase —
// everything else is listed honestly as "coming soon", never given fabricated content.

export type LmdProjectStub = {
  id: string;
  name: string;
  country: "Egypt" | "UAE" | "Spain" | "Greece";
  /** Only set for projects with a real, calibrated interactive experience in this app. */
  href?: string;
  /** [lng, lat] of a real, sourced location — omitted rather than guessed where unconfirmed. */
  lngLat?: [number, number];
  /** "exact" = calibrated site anchor. "district"/"city" = a real named area from LMD's own site, not the parcel. */
  precision?: "exact" | "district" | "city";
};

export const LMD_PROJECTS: LmdProjectStub[] = [
  { id: "mindset", name: "Mindset", country: "Egypt", lngLat: [30.9756, 30.0131], precision: "district" }, // Sheikh Zayed City
  { id: "8ight", name: "8ight", country: "Egypt" }, // area not confirmed — no pin
  { id: "zoya", name: "Zoya", country: "Egypt", href: "/", lngLat: [28.595006, 31.024578], precision: "exact" },
  // Not from the lmd.com.eg scrape (not publicly listed there) — coordinates and 3D model
  // supplied directly, id matches its PROJECTS entry in GlobePortfolioMap.tsx exactly (no
  // "zoya"-vs-"zoya-ghazala-bay"-style alias needed).
  { id: "bec", name: "BEC", country: "Egypt", href: "/", lngLat: [34.757373, 28.067182], precision: "exact" },
  { id: "one-ninety", name: "One Ninety", country: "Egypt", lngLat: [31.4025592, 30.0133243], precision: "exact" },
  { id: "3sixty", name: "3'Sixty", country: "Egypt", lngLat: [31.49, 30.03], precision: "district" }, // New Cairo
  { id: "layan", name: "Layan", country: "Egypt" }, // area not confirmed — no pin
  { id: "taiyo-residences", name: "Taiyo Residences", country: "UAE", lngLat: [55.14, 25.0805], precision: "city" }, // Dubai
  { id: "the-pier-residence", name: "The Pier Residence", country: "UAE", lngLat: [55.14, 25.0805], precision: "city" }, // Dubai
  { id: "rukan-community", name: "Rukan Community", country: "UAE", lngLat: [55.3708, 25.0378], precision: "district" }, // Dubailand
  { id: "muntaner-91", name: "Muntaner 91", country: "Spain", lngLat: [2.1478, 41.3915], precision: "district" }, // Eixample, Barcelona
  { id: "karaiskaki-15", name: "Karaiskaki 15", country: "Greece", lngLat: [23.6481, 37.9475], precision: "district" }, // Piraeus, Athens
];
