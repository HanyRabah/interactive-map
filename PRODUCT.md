# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, at two different stages:

1. **Near-term / current build target — developer decision-makers.** Marketing/sales leadership at real-estate developers (currently LMD, a major Egyptian developer) who are evaluating whether to *buy* this platform. They see it as a live sales-pitch demo, built around one of their own real projects.
2. **Long-term / end product — home-buyers.** Once a developer buys in, their prospective buyers use the deployed, white-labeled experience to explore a project's location, masterplan, and units and to submit inquiries (per docs/product-plan.md's full journey).

## Product Purpose

DP Interactive is a sales instrument as much as a product: an interactive map + 3D showreel that DP Productions uses to demonstrate its real-estate visualization capability to a prospective developer client, built around one of that developer's own real projects rather than a generic template. Success for the current build = the developer is impressed enough to purchase the platform for their projects.

The concrete current target: **LMD**, using their **Zoya** project (Ghazala Bay) as the flagship demo.

## Positioning

Not "an interactive map" — a cinematic, wow-factor interactive showreel that unites location intelligence, aerial photography/video, construction progress, and project storytelling with smooth, three.js-driven camera choreography and animation. This is the mechanism a static brochure, PDF deck, or generic map embed cannot truthfully copy.

## Operating Context

- Primarily demonstrated live, in a sales-pitch/meeting setting, to convince a developer's decision-maker.
- Runs in-browser; desktop is the primary pitch context, but per docs/product-plan.md the eventual product must hold up on mobile too.
- The existing multi-developer globe view (LMD, Hassan Allam, Emaar, Aldar, DGDA, ROSHN, St. Modwen, etc.) establishes DP's breadth and credibility before narrowing into the single real LMD/Zoya project that carries the actual pitch.

## Capabilities and Constraints

**Confirmed near-term focus** (explicitly named by the user as needed for the pitch):
- Interactive map with project location intelligence (surroundings, distances, landmarks).
- Aerial photography and aerial video.
- Construction progress / updates.
- Project description / storytelling.
- A "wow" effect achieved through smooth animation and modern rendering technique (three.js or equivalent) — this is an explicit, open-ended request to make this the best-in-class interactive map experience in this category, not a fixed feature list.

**Longer-term roadmap, not yet locked for the current build:** the fuller platform vision in docs/product-plan.md — CRM/live availability integration, admin CMS, floor-plan/unit-level drill-down, lead capture forms, white-label multi-domain deployment, Arabic/English localization. Treat these as roadmap direction, not confirmed scope, unless the user pulls one in explicitly.

**Stack already in place:** Next.js 16, React 19, TypeScript, Mapbox GL JS, Three.js. Three.js-driven motion is the user's explicit direction for the "wow" differentiator.

**Assets:** one real 3D asset currently in the repo, `public/models/zoya-ghazala-bay.glb`, for the LMD Zoya project.

## Brand Commitments

Product is branded **"DP Interactive"** by **DP Productions** (per `package.json` and `layout.tsx` metadata). No client-specific (LMD/Zoya) logo, color palette, or font assets exist in the repo yet — `public/` currently only has Next.js scaffold defaults (`next.svg`, `vercel.svg`, etc.).

## Evidence on Hand

- `docs/product-plan.md` — a 756-line full-platform product vision (partially confirmed; see Product Principles for how to weigh it).
- `src/components/GlobePortfolioMap.tsx` — existing globe view listing DP's broader placeholder portfolio across multiple countries, used to establish credibility/breadth.
- `public/models/zoya-ghazala-bay.glb` — the one real 3D asset on hand, for the LMD Zoya project.
- No real LMD/Zoya brand assets (logo, colors, fonts) on hand yet.
- No confirmed testimonials, pricing, or case studies exist — future work must not fabricate them.

## Product Principles

1. This build is a sales instrument first: judge feature and design choices by whether they make a developer decision-maker want to buy, not by completeness against the full platform vision.
2. Lead with the confirmed near-term feature set — location map, aerial photography/video, construction progress, project description — before pulling in later-phase features (CRM, units/floor plans, lead forms) from docs/product-plan.md.
3. Favor cinematic, smooth, three.js-driven motion and camera choreography as the core differentiator; per docs/product-plan.md's "wow moments" guidance, keep transitions purposeful and skippable rather than constant or gratuitous.
4. The real LMD/Zoya project and its GLB asset are the flagship proof; the existing multi-developer globe view supports credibility, but the demo's persuasive core is the single real project explored in depth.
5. Preserve the layered journey (location → masterplan → project detail) from docs/product-plan.md as the throughline even while near-term scope stays narrower than the full vision.

## Accessibility & Inclusion

No product-specific requirement established yet.
