"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

export type LngLat = [number, number];

export function boundsAround(lng: number, lat: number, halfMeters = 300): { sw: LngLat; ne: LngLat } {
  const latDelta = halfMeters / 111_320;
  const lngDelta = halfMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { sw: [lng - lngDelta, lat - latDelta], ne: [lng + lngDelta, lat + latDelta] };
}

export default function MapCompareOverlay({
  map,
  bounds,
  beforeImage,
  beforeLabel,
  afterImage,
  afterLabel,
}: {
  map: mapboxgl.Map;
  bounds: { sw: LngLat; ne: LngLat };
  beforeImage: string;
  beforeLabel: string;
  afterImage: string;
  afterLabel: string;
}) {
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [split, setSplit] = useState(50);
  const dragging = useRef(false);

  useEffect(() => {
    const update = () => {
      const a = map.project(bounds.sw);
      const b = map.project(bounds.ne);
      setRect({
        left: Math.min(a.x, b.x),
        top: Math.min(a.y, b.y),
        width: Math.abs(b.x - a.x),
        height: Math.abs(a.y - b.y),
      });
    };
    update();
    map.on("move", update);
    return () => {
      map.off("move", update);
    };
  }, [map, bounds]);

  if (!rect) return null;

  const setFromClientX = (clientX: number) => {
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplit(Math.min(100, Math.max(0, pct)));
  };

  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className="pointer-events-auto absolute select-none overflow-hidden rounded-md shadow-[0_0_0_9999px_rgba(10,12,20,0.55)] ring-2 ring-indigo-400/70"
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        onMouseDown={(e) => {
          dragging.current = true;
          setFromClientX(e.clientX);
        }}
        onMouseMove={(e) => dragging.current && setFromClientX(e.clientX)}
        onMouseUp={() => (dragging.current = false)}
        onMouseLeave={() => (dragging.current = false)}
        onTouchStart={(e) => setFromClientX(e.touches[0].clientX)}
        onTouchMove={(e) => setFromClientX(e.touches[0].clientX)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={beforeImage} alt={beforeLabel} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={afterImage} alt={afterLabel} className="h-full w-full object-cover" draggable={false} />
        </div>

        {rect.width > 140 && (
          <>
            <div className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-medium text-zinc-200">
              {beforeLabel}
            </div>
            <div className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-medium text-zinc-200">
              {afterLabel}
            </div>
          </>
        )}

        <div className="absolute inset-y-0 w-0.5 bg-white/90" style={{ left: `${split}%` }}>
          <div className="absolute top-1/2 left-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xs text-black shadow-lg">
            ⇔
          </div>
        </div>
      </div>
    </div>
  );
}
