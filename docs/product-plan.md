# DP Interactive — Product Plan

## 1. Product definition
DP Interactive should be positioned as a white-label real-estate visualization platform that combines:
- Interactive maps
- 3D masterplans
- Unit availability
- Virtual tours
- Aerial photography
- Aerial videography
- Construction progress
- Before-and-after comparison
- Location and infrastructure intelligence
- Lead generation and CRM integration

The platform should not be presented merely as an interactive map. It should be presented as a digital sales experience for real-estate developments.

DP Productions already provides the underlying visual-production capabilities: aerial photography, aerial videography, 360° virtual tours, interactive maps, and 3D visualization. This means the product can unite existing DP services instead of creating an unrelated new service line.

## 2. Core product proposition
Explore an entire real-estate development from location to unit in one continuous interactive experience.

The user moves through several levels:

```
Country / City
      ↓
Developer
      ↓
Development location
      ↓
Project masterplan
      ↓
Phase / neighborhood
      ↓
Building
      ↓
Unit type
      ↓
Floor plan
      ↓
Virtual tour
      ↓
Availability and inquiry
```

This layered approach is more valuable than loading users directly into a heavy 3D scene.

## 3. Main user journey

### Stage 1 — Cinematic entry
The project opens with a short branded sequence:
- Client logo animation
- Globe or regional view
- Camera moves toward Egypt, Cairo, New Cairo, North Coast, or the project location
- Project boundaries appear
- The live masterplan loads
- The interface transitions into exploration mode

This should be short and skippable. The introduction establishes the visual impact. The main interface must then prioritize clarity and performance.

### Stage 2 — Regional map
The user sees:
- Project location
- Major roads
- Airports
- Public transportation
- Schools and universities
- Hospitals
- Shopping centers
- Business districts
- Entertainment destinations
- Landmarks
- Travel times and distances

Example interactions:
- Cairo International Airport — 28 minutes
- New Administrative Capital — 15 minutes
- American University in Cairo — 18 minutes
- Nearest hospital — 7 minutes
- Nearest shopping center — 10 minutes

Filters should allow users to turn categories on and off.

### Stage 3 — Bird's-eye project view
The user enters a controlled aerial view showing:
- Masterplan boundaries
- Project phases
- Main entrances
- Roads
- Green spaces
- Water features
- Clubhouses
- Commercial areas
- Schools
- Sports facilities
- Unit zones
- Construction progress

This view can combine an aerial image, a rendered environment, terrain, and lightweight 3D models.

### Stage 4 — Masterplan exploration
The masterplan becomes interactive. Users can:
- Hover over buildings or parcels
- Select phases
- Filter by property type
- Filter by availability
- Filter by price range
- Filter by bedrooms
- Filter by area
- Show amenities
- Show construction progress
- Compare planned and current conditions
- Search for a specific building or unit

### Stage 5 — Building and unit exploration
Selecting a building should open progressive levels of information:

```
Building
  → Floors
      → Unit types
          → Individual units
```

**Building view:**
- Rotate building
- Zoom
- Isolate floors
- Remove roof
- Highlight available units
- Show façade orientation
- Show views
- Show nearby amenities
- Show construction status

**Unit view:**
- Unit number
- Floor
- Area
- Bedrooms
- Bathrooms
- Garden or terrace
- Orientation
- Exact measurements
- Floor plan
- 3D floor plan
- Interior renders
- Virtual tour
- Price or "request price"
- Availability
- Payment plan
- Downloadable brochure
- Inquiry action

### Stage 6 — Immersive content
DP content should be attached directly to locations and objects:
- 360° tour inside a unit
- Aerial video from a viewpoint
- Construction photography from a selected date
- Interior walkthrough
- Render gallery
- Before-and-after comparison
- Progress timeline

The user should not be redirected to unrelated pages whenever possible. Media should open within the interactive experience.

### Stage 7 — Conversion
Every project and unit should support:
- Request information
- Book a viewing
- Contact sales
- WhatsApp
- Call
- Email
- Download brochure
- Save unit
- Share unit
- Compare units

The inquiry must include context automatically:

```json
{
  "developer": "LMD",
  "project": "One Ninety",
  "building": "Building A",
  "unit": "A-204",
  "source": "DP Interactive",
  "selected_language": "English"
}
```

## 4. Main experience modes
The product should have clearly separated modes rather than placing every feature on one screen.

- **Explore** — The normal interactive map and 3D experience.
- **Properties** — Unit and building availability.
- **Location** — Infrastructure, transport, schools, shopping, landmarks, and distances.
- **Lifestyle** — Amenities, public spaces, landscaping, clubs, retail, and community experience.
- **Virtual Tours** — Available exterior and interior 360° tours.
- **Media** — Aerial videos, photography, renders, and promotional films.
- **Progress** — Construction updates over time.
- **Compare** — Before-and-after comparison and historical imagery.

## 5. Before-and-after functionality
The before-and-after tool should be integrated into the map story rather than opening as an isolated page.

**Use case 1 — Masterplan versus current site**
- Left side: Current aerial photography
- Right side: Completed masterplan or 3D render
- The camera position and zoom must remain synchronized.

**Use case 2 — Construction progress**
Compare: January 2026, April 2026, August 2026, Current date. The user can use a slider or timeline.

**Use case 3 — Original land versus development**
Show: Undeveloped land, Infrastructure construction, Current construction, Final visualization.

**Use case 4 — Building progress**
Selecting a building displays its construction history.

**Use case 5 — Infrastructure impact**
Show how roads, landscaping, public spaces, and surrounding districts will change.

**Recommended controls:**
- Split slider
- Fade transition
- Timeline
- Side-by-side mode
- Play progress animation
- Date labels
- Construction milestone markers

## 6. White-label client structure
The platform should support multiple developers from one system.

Example URL structure:
```
interactive.dpproductions.net/lmd
interactive.dpproductions.net/lmd/one-ninety
interactive.dpproductions.net/hassan-allam
interactive.dpproductions.net/hassan-allam/swan-lake
```

Custom domains can also be supported:
```
explore.oneninety.com
interactive.hassanallam.com
masterplan.client-domain.com
```

**Branding configuration** — Each developer receives:
- Logo
- Primary color
- Secondary color
- Accent color
- Typography
- Button style
- Loading screen
- Map style
- Icon style
- Tone of voice
- Intro animation
- Background music option
- Arabic and English content
- Custom domain
- Analytics configuration
- CRM configuration

A theme configuration could look like:

```json
{
  "client": "LMD",
  "theme": {
    "primary": "#1D2633",
    "secondary": "#C6A76A",
    "accent": "#FFFFFF",
    "fontHeading": "Client Display Font",
    "fontBody": "Inter",
    "logo": "/clients/lmd/logo.svg"
  }
}
```

Do not create a separate codebase for every client. Use one platform with configurable themes, content, features, and integrations.

## 7. Platform hierarchy

```
DP Interactive Platform
│
├── Developers
│   ├── LMD
│   ├── Hassan Allam
│   └── Other developers
│
├── Projects
│   ├── One Ninety
│   ├── Stei8ht
│   └── Swan Lake
│
├── Phases
│   ├── Phase 1
│   ├── Phase 2
│   └── Future phases
│
├── Buildings / Parcels
│
├── Floors
│
├── Units
│
├── Amenities
│
├── Points of interest
│
├── Media
│   ├── Aerial photos
│   ├── Aerial videos
│   ├── 360° tours
│   ├── Renders
│   └── Construction updates
│
└── CRM and analytics
```

## 8. Technical architecture

### Frontend
Recommended stack:
- Next.js
- TypeScript
- React
- Mapbox GL JS
- Three.js
- React Three Fiber
- GSAP
- Deck.gl where needed
- Zustand
- TanStack Query
- i18next or next-intl

**Technology responsibilities**

| Technology | Responsibility |
|---|---|
| Next.js | Application structure, routing, rendering and deployment |
| Mapbox GL JS | Geographic map, terrain, roads, labels and points of interest |
| Three.js | Custom buildings, project masterplans and interactive 3D scenes |
| React Three Fiber | React-based management of Three.js scenes |
| GSAP | Camera transitions, storytelling and interface animation |
| Deck.gl | Large geospatial datasets, advanced layers and visual analysis |
| Zustand | Camera, filters, selected object and interface state |
| TanStack Query | CRM, units, availability and content data |
| Rive | Lightweight branded interface animations |
| Lottie | Simple icon and loading animations |

**Important technical decision**
Do not treat Mapbox and Three.js as separate products. Use:
- Mapbox for geographic context
- Three.js custom layers for project models
- Shared geographic coordinates
- Synchronized camera and interaction
- HTML interface over the rendering canvas

### Backend
Recommended stack:
- Node.js / Next.js API
- PostgreSQL
- PostGIS
- Prisma or Drizzle
- Redis
- S3-compatible object storage
- CDN
- Background asset-processing workers

**PostGIS usage** — PostGIS should store:
- Project boundaries
- Building footprints
- Parcel boundaries
- Roads
- Amenities
- Points of interest
- Coordinates
- Distance calculations
- Geographic search areas

### Content management
The admin system must allow DP staff to manage:
- Developers
- Projects
- Phases
- Buildings
- Units
- Amenities
- Locations
- Videos
- Images
- Virtual tours
- Construction dates
- Before-and-after layers
- Languages
- Themes
- CRM mappings
- Published versions

## 9. 3D asset pipeline
The difficult part is not loading a Three.js model. It is creating a repeatable production pipeline.

**Input formats** — DP may receive: Revit, AutoCAD, SketchUp, 3ds Max, Blender, Rhino, IFC, FBX, OBJ, Drone photogrammetry, Point clouds, Rendered masterplans.

**Web output** — The standard web format should be GLB / glTF.

Each model should be:
- Georeferenced
- Optimized
- Divided into selectable objects
- Named consistently
- Assigned stable IDs
- Compressed
- Delivered in levels of detail

**Object naming convention**
```
PROJECT_PHASE_BUILDING_FLOOR_UNIT
```
Example: `ONE190_P1_B03_F05_U0504`

The same identifier must exist in: 3D model metadata, platform database, CRM, admin interface, analytics events.

**Optimization requirements**
- Draco mesh compression
- KTX2 compressed textures
- Texture atlases
- Mesh instancing
- Geometry simplification
- Level of detail
- Frustum culling
- Lazy loading
- Progressive loading
- Mobile-specific assets
- Limited real-time shadows
- Baked lighting where possible

Without strict asset optimization, the visual experience will become unstable on mobile devices.

## 10. CRM and availability integration

**Integration methods** — Support three levels.

- **Level 1 — Manual administration.** DP or the developer updates unit status manually. Suitable for the first prototype.
- **Level 2 — Scheduled synchronization.** The platform imports CSV, Excel, XML, JSON, or scheduled API output. Updates occur every few minutes.
- **Level 3 — Real-time integration.** The developer CRM sends changes by REST API, Webhook, GraphQL, or message queue.

Example status values: `AVAILABLE`, `RESERVED`, `SOLD`, `BLOCKED`, `COMING_SOON`, `NOT_RELEASED`

**CRM safety rules**
- The 3D interface must never query a CRM directly.
- CRM credentials remain on the backend.
- Availability should be cached.
- Failed synchronization must not incorrectly mark units as available.
- Every update should have a timestamp.
- Administrators need an integration log.
- Manual overrides need permissions and audit history.

## 11. Data model
Core entities: Organization, Developer, Project, ProjectPhase, Building, Floor, Unit, UnitType, Amenity, PointOfInterest, InfrastructureCategory, MediaAsset, VirtualTour, ConstructionUpdate, ComparisonLayer, Theme, CRMIntegration, Lead, User, Role, AnalyticsEvent.

Important relationships:
```
Developer
  has many Projects

Project
  has many Phases
  has many Buildings
  has many Amenities
  has many MediaAssets
  has one Theme override

Building
  has many Floors
  has many Units
  references one or more 3D object IDs

Unit
  has one UnitType
  has one current AvailabilityStatus
  can have multiple FloorPlans
  can have multiple MediaAssets
```

## 12. User interface structure

**Desktop layout**
```
┌──────────────────────────────────────────────────────────┐
│ Logo     Project selector       Language    Contact      │
├───────────────┬──────────────────────────────────────────┤
│               │                                          │
│ Filters       │                                          │
│               │             3D Map                       │
│ Search        │                                          │
│               │                                          │
│ Layers        │                                          │
│               │                                          │
├───────────────┴──────────────────────────────────────────┤
│ Selected project / building / unit information           │
└──────────────────────────────────────────────────────────┘
```

**Mobile layout**
- Full-screen map
- Bottom navigation
- Collapsible bottom sheet
- Floating layer selector
- Simplified 3D assets
- Reduced animations
- Touch-friendly object selection

**Main navigation**
Explore, Properties, Location, Lifestyle, Tours, Progress, Media

## 13. Visual "wow" moments
Use a limited set of deliberate visual moments.

**Recommended**
- Globe-to-project camera sequence
- Animated project boundary
- Smooth transition from aerial map to masterplan
- Building extrusion on selection
- Floor separation animation
- Unit highlight pulse
- Day-to-night mode
- Before-and-after transition
- Construction timeline
- Animated route to landmarks
- Water and landscaping effects
- Cinematic media transitions
- Interactive branded loading experience

**Avoid**
- Constant camera movement
- Long introductions
- Excessive particles
- Heavy reflections everywhere
- Unnecessary physics
- Animation that blocks navigation
- Loading the full-resolution project immediately
- Hiding information behind experimental interactions

The interface should feel cinematic during transitions and precise during decision-making.

## 14. DP Productions' competitive advantage
DP should not compete only as a software vendor. Its advantage is the ability to provide the entire content and platform pipeline:

```
Drone capture
    +
Aerial photography
    +
Aerial videography
    +
360° tours
    +
3D visualization
    +
Interactive masterplan
    +
Construction progress
    +
CRM integration
```

DP already positions itself as an end-to-end real-estate and construction visual-production company. The interactive platform can become the layer that connects all those deliverables into a continuously updated product.

Competitors also describe interactive masterplans as bird's-eye exploration systems that connect exterior project visualization with property information.

The DP proposition should therefore be: **One team captures, visualizes, builds, publishes, and updates the entire digital property experience.**

## 15. Product packages

- **Package 1 — Interactive Location Map**: Branded map, project location, nearby infrastructure, distance calculations, media gallery, lead form.
- **Package 2 — Interactive 2D Masterplan**: Clickable masterplan, phases, buildings, amenities, availability, search and filters, CRM synchronization.
- **Package 3 — Interactive 3D Masterplan**: Full 3D project model, building selection, camera navigation, unit highlighting, floor exploration, media integration.
- **Package 4 — Digital Sales Experience**: 3D masterplan, live unit inventory, floor plans, virtual tours, before-and-after, aerial content, construction progress, analytics, CRM, sales-team interface.
- **Package 5 — Digital Twin Subscription**: Recurring drone captures, scheduled construction updates, new project phases, asset updates, CRM maintenance, performance monitoring, monthly analytics, hosting and support.

This creates both project revenue and recurring revenue.

## 16. Admin platform
DP staff need an internal control system.

**Main admin sections:** Dashboard, Developers, Projects, Masterplans, Buildings, Units, Availability, Amenities, Nearby locations, Virtual tours, Photography, Videos, Construction updates, Before/after, Themes, Integrations, Leads, Analytics, Users and permissions.

**Publishing workflow**
```
Draft
  → Internal review
      → Client review
          → Published
```

The admin system should support preview links before publication.

## 17. Analytics
Track: Project views, Masterplan interactions, Selected buildings, Selected unit types, Selected units, Filter usage, Virtual-tour opens, Video plays, Brochure downloads, Contact actions, WhatsApp actions, Lead submissions, Time spent per project area, Most-viewed amenities, Most-viewed construction dates, Device and language, CRM conversion where available.

Useful client reporting: Most viewed building, Most requested unit type, Most used price filter, Most popular amenity, Virtual-tour completion, Inquiry conversion rate, Arabic versus English usage.

## 18. Delivery phases

### Phase 0 — Discovery and prototype definition
Deliverables: Product requirements, User journeys, Client hierarchy, Content inventory, CRM assessment, 3D source-file assessment, Performance targets, Visual direction, Prototype project selection.

Choose one visually strong DP project with complete assets.

### Phase 1 — Visual proof of concept
Build: One branded project, Mapbox location map, One optimized Three.js masterplan, Project intro, Camera navigation, Building hover and selection, Basic information panel, One aerial video, One virtual tour, One before-and-after example. No full CRM integration yet.

Goal — Prove: Visual quality, Technical feasibility, Model performance, Mobile behavior, Sales presentation value.

### Phase 2 — Functional MVP
Add: Developer and project routing, White-label themes, Admin CMS, Buildings and units, Search and filters, Availability statuses, Amenities, Points of interest, Lead forms, Arabic and English, Analytics, Manual or file-based inventory updates.

### Phase 3 — Commercial platform
Add: Live CRM integration, Floors and individual units, Floor plans, Construction timeline, Media management, Client accounts, Approval workflow, Custom domains, Role permissions, Unit comparison, Favorites and sharing.

### Phase 4 — Advanced experience
Add selectively: Interior real-time 3D, Sun and shadow simulation, View analysis, Day and night modes, Kiosk mode, Sales-center display synchronization, Tablet sales application, Automated drone imagery alignment, Gaussian splatting for selected environments, Advanced digital-twin functionality.

## 19. MVP boundary
The first version should not attempt to build the complete platform.

**MVP must include**
- One developer
- One project
- One 3D masterplan
- One project location map
- Buildings and amenities
- Basic availability
- One 360° virtual tour
- Aerial photography
- Aerial video
- Before-and-after comparison
- Arabic and English
- Responsive desktop and mobile interface
- Lead form
- Basic analytics

**MVP should exclude**
- Full individual-unit 3D interiors
- Complex real-time shadows
- Multiple CRM providers
- Native mobile applications
- AR
- VR headset application
- AI recommendations
- Automated BIM conversion
- Multi-project sales dashboards
- Full digital-twin engineering data

## 20. Major risks

- **3D model quality** — Architectural models are usually too large and detailed for the web. Control: establish a strict optimization and naming pipeline before frontend development.
- **Mobile performance** — A desktop-quality 3D masterplan may fail on ordinary mobile devices. Control: create multiple asset-quality profiles and progressive loading.
- **Incorrect availability** — Showing a sold unit as available damages client trust. Control: cache safely, timestamp updates, log synchronization, and default uncertain inventory to unavailable.
- **Inconsistent client source files** — Every developer will provide different CAD, BIM, naming, and CRM formats. Control: define a formal client onboarding specification.
- **Excessive scope** — Virtual tours, maps, 3D models, CRM, media, floor plans, and construction updates can become separate products. Control: preserve the layered journey and build the platform in modules.
- **Visual design overriding usability** — The product can become visually impressive but difficult to use. Control: separate cinematic transitions from normal exploration.

## 21. Recommended initial architecture

```
apps/
├── experience-web
├── admin-web
└── api

packages/
├── ui
├── map-engine
├── three-engine
├── animation
├── client-themes
├── data-model
├── crm-connectors
├── analytics
└── asset-utils

services/
├── database
├── media-storage
├── asset-processing
├── inventory-sync
└── notifications
```

Initial deployment:
```
Vercel
  → Next.js applications

PostgreSQL + PostGIS
  → Project and geographic data

S3 / Cloudflare R2
  → GLB models, textures, videos and images

CDN
  → Global asset delivery

Redis
  → Availability and API caching

Background worker
  → Model processing and CRM synchronization
```

## 22. Initial prototype scenario
A strong demonstration should contain one complete story:

1. DP Productions branded loading screen
2. Developer logo appears
3. Globe transitions to Cairo
4. Nearby landmarks appear
5. Camera travels to the project
6. Project boundary is drawn
7. Existing aerial photography appears
8. Final masterplan fades into place
9. User explores project phases
10. User selects a building
11. Building rises or becomes isolated
12. Available units are highlighted
13. User opens a unit
14. Floor plan and measurements appear
15. User enters the 360° tour
16. User returns to the map
17. User compares construction with final visualization
18. User submits an inquiry

This prototype communicates the entire product without requiring every final platform feature.

## 23. Immediate preparation documents
Before implementation, create these seven documents:
1. Product Requirements Document
2. Experience and User Journey
3. Information Architecture
4. Technical Architecture
5. 3D Asset Preparation Standard
6. Client Content and Integration Checklist
7. MVP Delivery Backlog

The first project should be treated as the platform foundation, not as a custom one-off interactive website.
