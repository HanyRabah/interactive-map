"use client";

import { useEffect, useRef, useState } from "react";

// The single set of controls for everything you can do once you are standing on a project:
// change how you look at the site, and open the three pieces of finished work that sit
// outside the map. It replaces the row of pills that used to run across the top, which fought
// the masterplan for the widest part of the screen — the one dimension the artwork needs.
//
// Collapsed to a ~58px gutter, it costs the site almost nothing. Hovering (or focusing) an
// item opens its label out of a zero-width grid track, so the rail widens over the map and
// nothing beneath it moves — the artwork never shifts under the cursor.

const ACCENT = "#1c93a0";

export type RailItem = {
  id: string;
  label: string;
  icon: RailIcon;
  /** Runs in-app. Mutually exclusive with href. */
  onSelect?: () => void;
  /** Opens in a new tab; the item grows an outbound mark. */
  href?: string;
  active?: boolean;
  /** Starts a new group — draws a hairline above this item. */
  startsGroup?: boolean;
};

export type RailIcon =
  | "globe"
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
const ICONS: Record<RailIcon, string> = {
  // Meridians and equator — the same mark the globe button used before the rail absorbed it.
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.9 5.7 3.9 9s-1.4 6.4-3.9 9c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3z"/>',
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

function Icon({ name }: { name: RailIcon }) {
  return (
    <svg
      width="18"
      height="18"
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
export type RailProps = {
  label: string;
  stage: "hero" | "masterplan";
  hasMasterplan: boolean;
  has2Dand3D: boolean;
  masterplanMode: "2d" | "3d";
  topView: boolean;
  virtualTourUrl?: string;
  filmUrl?: string;
  galleryUrl?: string;
  onGlobe: () => void;
  onOverview: () => void;
  onOpenMasterplan: () => void;
  onToggleMode: () => void;
  onToggleTopView: () => void;
  onFilm: () => void;
  onEnquire: () => void;
};

function buildRailItems(opts: RailProps): RailItem[] {
  const items: RailItem[] = [];

  // Leaving the project entirely is the top of the hierarchy, so it sits at the top of the
  // rail. It used to be a lone button in the top-right, which collided with the wordmark on a
  // phone and made navigation live in two places at once.
  items.push({ id: "globe", label: "Back to the globe", icon: "globe", onSelect: opts.onGlobe });

  if (opts.stage === "masterplan") {
    items.push({ id: "overview", label: "Site overview", icon: "overview", onSelect: opts.onOverview, startsGroup: true });
    if (opts.has2Dand3D) {
      items.push({
        id: "mode",
        label: opts.masterplanMode === "2d" ? "View in 3D" : "View 2D masterplan",
        icon: "cube",
        onSelect: opts.onToggleMode,
        active: opts.masterplanMode === "3d",
      });
    }
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
    items.push({
      id: "masterplan",
      label: "Explore masterplan",
      icon: "masterplan",
      onSelect: opts.onOpenMasterplan,
      startsGroup: true,
    });
  }

  // The finished work that lives outside the map. Absent entries are omitted, never disabled:
  // a greyed-out control in front of a client is a promise the demo cannot keep.
  const media: RailItem[] = [];
  if (opts.virtualTourUrl) media.push({ id: "tour", label: "Virtual tour", icon: "tour", href: opts.virtualTourUrl });
  if (opts.filmUrl) media.push({ id: "film", label: "Film", icon: "film", onSelect: opts.onFilm });
  if (opts.galleryUrl) media.push({ id: "gallery", label: "Gallery", icon: "gallery", href: opts.galleryUrl });
  if (media.length > 0) {
    media[0].startsGroup = items.length > 0;
    items.push(...media);
  }

  items.push({
    id: "enquire",
    label: "Enquire",
    icon: "enquire",
    startsGroup: items.length > 0,
    onSelect: opts.onEnquire,
  });

  return items;
}

export function SiteRail(props: RailProps) {
  const { label } = props;
  const items = buildRailItems(props);
  // Entrance is the rail's one authored moment: items settle in sequence, once, on arrival.
  // Everything after is a hover response, so the rail never animates while it is being used.
  const [entered, setEntered] = useState(false);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    raf.current = requestAnimationFrame(() => setEntered(true));
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <nav
      aria-label={label}
      className="pointer-events-none absolute left-0 top-0 z-30 flex h-full items-center pl-3 sm:pl-4"
    >
      <div className="pointer-events-auto flex flex-col rounded-[20px] border border-white/12 bg-[#08110f]/80 py-2 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.85)] backdrop-blur-md">
        {items.map((item, i) => {
          const content = (
            <>
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition-colors duration-200"
                style={{
                  color: item.active ? ACCENT : "#d5e0dc",
                  backgroundColor: item.active ? "rgba(28,147,160,0.16)" : "transparent",
                }}
              >
                <Icon name={item.icon} />
              </span>
              {/* The label lives in a grid track that opens from 0fr to 1fr. Animating a
                  grid track rather than width means the label needs no measured size and no
                  max-width guess, and it stays smooth at any label length. */}
              <span className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-300 ease-out group-hover:grid-cols-[1fr] group-focus-visible:grid-cols-[1fr]">
                <span className="overflow-hidden">
                  <span className="block whitespace-nowrap pr-4 font-mono text-[10px] uppercase tracking-[0.22em] text-[#f5f3ee]">
                    {item.label}
                  </span>
                </span>
              </span>
              {item.href && (
                <span
                  className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-300 ease-out group-hover:grid-cols-[1fr] group-focus-visible:grid-cols-[1fr]"
                  aria-hidden="true"
                >
                  <span className="overflow-hidden">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-4 block text-[#7f938e]"
                    >
                      <path d="M8 5h11v11" />
                      <path d="M19 5 6 18" />
                    </svg>
                  </span>
                </span>
              )}
            </>
          );

          const shared =
            "group relative flex items-center rounded-2xl outline-none transition-colors duration-200 hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus-visible:ring-1 focus-visible:ring-white/40";
          // Staggered settle: each item arrives from slightly left, 40ms apart.
          const style: React.CSSProperties = {
            opacity: entered ? 1 : 0,
            transform: entered ? "translateX(0)" : "translateX(-8px)",
            transition: `opacity 420ms cubic-bezier(0.16,1,0.3,1) ${i * 40}ms, transform 420ms cubic-bezier(0.16,1,0.3,1) ${i * 40}ms`,
          };

          return (
            <div key={item.id} className="px-2" style={style}>
              {item.startsGroup && <div className="mx-2 my-1.5 h-px bg-white/10" />}
              {item.href ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={item.label}
                  className={shared}
                >
                  {content}
                </a>
              ) : (
                <button type="button" onClick={item.onSelect} title={item.label} className={shared}>
                  {content}
                </button>
              )}
              {/* The active marker rides the left edge of the rail, not the item, so the
                  eye can find "where am I" without reading any label. */}
              {item.active && (
                <span
                  className="pointer-events-none absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full"
                  style={{ backgroundColor: ACCENT }}
                />
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

// The film overlay. A modal is right here: the film wants the screen, and everything behind
// it is a map that would keep animating under a non-modal player.
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
