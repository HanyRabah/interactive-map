"use client";

import { useEffect, useRef, useState } from "react";

// The single set of controls for everything you can do once you are standing on a project:
// change how you look at the site, and open the finished work that sits outside the map.
//
// It reads as a header rather than a rail: sat next to the client's wordmark along the top
// edge, every label spelled out. An icon-only gutter asked the viewer to decode a picture
// before they knew what the thing did — fine for an app someone uses daily, wrong for a page
// a board member sees once. The masterplan keeps its width because the row is a single line
// of small type, not the stack of wrapping pills this replaced.

const ACCENT = "#1c93a0";

export type NavItem = {
  id: string;
  label: string;
  icon: NavIcon;
  /** Runs in-app. Mutually exclusive with href. */
  onSelect?: () => void;
  /** Opens in a new tab; the item grows an outbound mark. */
  href?: string;
  active?: boolean;
  /** Starts a new group — draws a hairline above this item. */
  startsGroup?: boolean;
};

export type NavIcon =
  | "nearby"
  | "overview"
  | "masterplan"
  | "cube"
  | "top"
  | "tour"
  | "film"
  | "gallery"
  | "enquire";

// Drawn at 24 on a 24 grid, single 1.5 stroke, so they read as one set at 18px. No glyphs,
// no emoji — those break the moment the rail sits on a bright patch of the masterplan.
const ICONS: Record<NavIcon, string> = {
  // Pin with a sweep, for what is around the site rather than on it.
  nearby: '<path d="M12 21s6.5-5.4 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.2"/>',
  // Arrow pulling back to the wider view.
  overview: '<path d="M10.5 5.5 4 12l6.5 6.5"/><path d="M4 12h11.5a4.5 4.5 0 0 1 0 9H13"/>',
  // A site plan: parcels inside a boundary.
  masterplan: '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M3.5 10h17"/><path d="M11 10v10.5"/><path d="M11 6.8h9.5"/>',
  // Isometric cube for the 3D model.
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5"/><path d="M12 12v9"/>',
  // Plan view: looking straight down.
  top: '<path d="M12 4.5v4"/><path d="m9.2 6.8 2.8-2.3 2.8 2.3"/><rect x="4.5" y="10.5" width="15" height="9" rx="1.5"/><path d="M4.5 15h15"/>',
  // 360 tour — a panorama band with a viewing point.
  tour: '<path d="M3.5 8.2c2.6-1.4 5.5-2.1 8.5-2.1s5.9.7 8.5 2.1v7.6c-2.6 1.4-5.5 2.1-8.5 2.1s-5.9-.7-8.5-2.1z"/><circle cx="12" cy="12" r="2.4"/>',
  // Play triangle in a frame.
  film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10.5 9.2 4.8 2.8-4.8 2.8z"/>',
  // Stacked frames.
  gallery: '<rect x="3.5" y="6.5" width="14" height="11" rx="1.5"/><path d="M7 6.5V4.5h13.5v11h-2"/><path d="m5.5 15 3.2-3.4 2.4 2.4 2.4-2.8 2.9 3.8z"/>',
  // Envelope.
  enquire: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.6 7 7.3 5.4a2 2 0 0 0 2.2 0L20.4 7"/>',
};

// Exported so the villa popup can use the same drawn set — a second icon vocabulary for the
// same three destinations would read as two different products.
export function NavGlyph({ name, size = 18 }: { name: NavIcon; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}

// Assembling the rail lives here, outside the component that owns the map, for two reasons:
// what belongs in the rail is a property of the rail, and keeping it a pure function of its
// arguments means the handlers arrive as plain values rather than as closures React's rules
// have to reason about.
export type SiteNavProps = {
  label: string;
  stage: "hero" | "masterplan";
  hasMasterplan: boolean;
  has2Dand3D: boolean;
  masterplanMode: "2d" | "3d";
  topView: boolean;
  virtualTourUrl?: string;
  filmUrl?: string;
  galleryUrl?: string;
  onOverview: () => void;
  onOpenMasterplan: () => void;
  onToggleMode: () => void;
  onToggleTopView: () => void;
  hasNearby: boolean;
  nearbyOpen: boolean;
  onNearby: () => void;
  onFilm: () => void;
  onEnquire: () => void;
};

function buildNavItems(opts: SiteNavProps): NavItem[] {
  const items: NavItem[] = [];

  if (opts.stage === "masterplan") {
    items.push({ id: "overview", label: "Site overview", icon: "overview", onSelect: opts.onOverview });
    // The 2D/3D toggle is deliberately absent: the 3D masterplan is not ready to be put in
    // front of a client. buildNavItems still takes onToggleMode so restoring it is one push.
    if (opts.hasMasterplan) {
      items.push({
        id: "top",
        label: opts.topView ? "Perspective view" : "Top view",
        icon: "top",
        onSelect: opts.onToggleTopView,
        active: opts.topView,
      });
    }
  } else if (opts.hasMasterplan) {
    items.push({ id: "masterplan", label: "Explore masterplan", icon: "masterplan", onSelect: opts.onOpenMasterplan });
  }

  // Nearby is a lens on the site, not a link off it, so it sits with the view controls and
  // marks itself active while its panel is open.
  if (opts.hasNearby) {
    items.push({
      id: "nearby",
      label: "Nearby",
      icon: "nearby",
      onSelect: opts.onNearby,
      active: opts.nearbyOpen,
    });
  }

  // The finished work that lives outside the map. Absent entries are omitted, never disabled:
  // a greyed-out control in front of a client is a promise the demo cannot keep.
  const media: NavItem[] = [];
  if (opts.virtualTourUrl) media.push({ id: "tour", label: "Virtual tour", icon: "tour", href: opts.virtualTourUrl });
  if (opts.filmUrl) media.push({ id: "film", label: "Video", icon: "film", onSelect: opts.onFilm });
  if (opts.galleryUrl) media.push({ id: "gallery", label: "Gallery", icon: "gallery", href: opts.galleryUrl });
  if (media.length > 0) {
    media[0].startsGroup = items.length > 0;
    items.push(...media);
  }

  // Masterplan only. Enquiring means naming a villa and a unit, and the product list is only
  // fetched once the masterplan is open — from the site overview the form would come up with
  // an empty picker and nothing to submit.
  if (opts.stage === "masterplan") {
    items.push({
      id: "enquire",
      label: "Enquire",
      icon: "enquire",
      startsGroup: items.length > 0,
      onSelect: opts.onEnquire,
    });
  }

  return items;
}

export function SiteNav(props: SiteNavProps) {
  const { label } = props;
  const items = buildNavItems(props);

  // Entrance is the nav's one authored moment: items settle in from the left, in sequence,
  // once. Everything after is a hover response, so it never animates while it is in use.
  const [entered, setEntered] = useState(false);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    raf.current = requestAnimationFrame(() => setEntered(true));
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label={label}
      // Top-left, clearing the wordmark. On a phone it becomes a horizontally scrollable
      // strip on its own line, because six labelled controls will not fit 375px and wrapping
      // them into three rows eats the masterplan.
      // Centred on the screen rather than anchored to the wordmark: the controls belong to
      // the project, not to the brand mark, and centring keeps them clear of the switcher on
      // the right at every width. On a phone it stays a horizontally scrollable strip on its
      // own line — six labelled controls will not fit 375px, and wrapping them into three
      // rows eats the masterplan.
      className="no-scrollbar absolute left-1/2 top-14 z-30 flex max-w-[calc(100%-2.5rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full border border-white/12 bg-[#08110f]/85 p-1 shadow-[0_16px_40px_-14px_rgba(0,0,0,0.85)] backdrop-blur-md sm:top-4 sm:max-w-[calc(100%-22rem)]"
    >
      {items.map((item, i) => {
        const content = (
          <>
            <span
              className="shrink-0 transition-colors duration-200"
              style={{ color: item.active ? ACCENT : "currentColor" }}
            >
              <NavGlyph name={item.icon} />
            </span>
            <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em]">
              {item.label}
            </span>
            {item.href && (
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="-ml-0.5 shrink-0 opacity-55"
                aria-hidden="true"
              >
                <path d="M8 5h11v11" />
                <path d="M19 5 6 18" />
              </svg>
            )}
          </>
        );

        const shared =
          "flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 outline-none transition-colors duration-200 focus-visible:ring-1 focus-visible:ring-white/50";
        const tone = item.active
          ? "bg-[rgba(28,147,160,0.16)] text-[#f5f3ee]"
          : "text-[#c9d6d2] hover:bg-white/[0.08] hover:text-[#f5f3ee]";
        const style: React.CSSProperties = {
          opacity: entered ? 1 : 0,
          transform: entered ? "translateX(0)" : "translateX(-6px)",
          transition: `opacity 380ms cubic-bezier(0.16,1,0.3,1) ${i * 45}ms, transform 380ms cubic-bezier(0.16,1,0.3,1) ${i * 45}ms`,
        };

        return (
          <div key={item.id} className="flex shrink-0 items-center" style={style}>
            {/* A hairline, not a gap: the groups are "where am I", "what else exists" and
                "act", and spacing alone read as an accident at this size. */}
            {item.startsGroup && <span className="mx-1 h-5 w-px shrink-0 bg-white/12" />}
            {item.href ? (
              <a href={item.href} target="_blank" rel="noopener noreferrer" className={`${shared} ${tone}`}>
                {content}
              </a>
            ) : (
              <button type="button" onClick={item.onSelect} className={`${shared} ${tone}`}>
                {content}
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}

// The video overlay. A modal is right here: the video wants the screen, and everything behind
// it is a map that would keep animating under a non-modal player.
//
// "film" survives as the internal name — the field, the icon key, this component — because
// renaming a stored column to match a label change is a migration for no gain. Everything a
// person reads says Video.
export function FilmOverlay({
  src,
  title,
  onClose,
}: {
  src: string;
  title: string;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Autoplay with sound is blocked everywhere; play() is called muted-free anyway because
    // this is a deliberate click, and the catch keeps a rejected promise from surfacing.
    videoRef.current?.play().catch(() => {});
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col bg-[#05100e]/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div className="flex shrink-0 items-center justify-between px-5 py-4 sm:px-8">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#8fa69e]">{title}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/15 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f5f3ee] transition-colors hover:border-white/40"
        >
          Close
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-5 pb-8 sm:px-8">
        <video
          ref={videoRef}
          src={src}
          controls
          playsInline
          // Clicking the video must not close the overlay the way clicking the backdrop does.
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]"
        />
      </div>
    </div>
  );
}
