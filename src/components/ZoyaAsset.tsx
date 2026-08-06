"use client";

import { useState } from "react";

/** Renders a real media file if present, or an honest "awaiting asset" plate — never a fabricated photo. */
export function ZoyaAsset({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={`flex items-center justify-center overflow-hidden bg-[#0f2a2b] ${className ?? ""}`}>
        <div className="w-full truncate px-2 text-center">
          <div className="truncate font-mono text-[8px] uppercase tracking-[0.15em] text-[#7fa9a3]">Awaiting</div>
          <div className="mt-0.5 truncate font-mono text-[8px] text-[#c9b98a]">{src.split("/").pop()}</div>
        </div>
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element -- dynamically-named public/ asset that may not exist yet; next/image fights the onError fallback
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}
