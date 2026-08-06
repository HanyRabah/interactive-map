"use client";

import { useState } from "react";

export type MediaPhoto = { caption: string; image: string };
export type MediaVideo = { title: string; poster: string; src?: string };

export default function MediaModal({
  projectName,
  photos = [],
  videos = [],
  onClose,
}: {
  projectName: string;
  photos?: MediaPhoto[];
  videos?: MediaVideo[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"photos" | "video">(videos.length ? "video" : "photos");
  const [lightbox, setLightbox] = useState<number | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden p-4 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between pb-4">
          <div>
            <div className="text-sm font-semibold text-zinc-100">{projectName}</div>
            <div className="text-[11px] text-zinc-500">Media</div>
          </div>
          <button
            onClick={onClose}
            className="rounded px-2 py-1.5 text-xs text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          >
            Close
          </button>
        </div>

        <div className="mb-4 flex shrink-0 gap-1 border-b border-white/10 text-xs">
          {videos.length > 0 && (
            <button
              onClick={() => setTab("video")}
              className={`px-3 py-2 font-medium ${tab === "video" ? "border-b-2 border-indigo-400 text-indigo-300" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Aerial Video
            </button>
          )}
          {photos.length > 0 && (
            <button
              onClick={() => setTab("photos")}
              className={`px-3 py-2 font-medium ${tab === "photos" ? "border-b-2 border-indigo-400 text-indigo-300" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Photo Gallery ({photos.length})
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "video" &&
            videos.map((v, i) => (
              <div key={i} className="mb-4 overflow-hidden rounded-lg border border-white/10 bg-white/5">
                {v.src ? (
                  <video controls poster={v.poster} src={v.src} className="aspect-video w-full bg-black" />
                ) : (
                  <div className="relative aspect-video w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.poster} alt={v.title} className="h-full w-full object-cover opacity-60" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-xl">▶</div>
                      <div className="mt-2 text-xs text-zinc-300">No video file attached yet</div>
                    </div>
                  </div>
                )}
                <div className="px-3 py-2 text-xs text-zinc-300">{v.title}</div>
              </div>
            ))}

          {tab === "photos" && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photos.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setLightbox(i)}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-white/10"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt={p.caption} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-left text-[10px] text-zinc-200">
                    {p.caption}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {lightbox !== null && photos[lightbox] && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-6"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 rounded px-2 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
          >
            Close
          </button>
          {lightbox > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightbox(lightbox - 1);
              }}
              className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-zinc-200 hover:bg-white/20"
            >
              ‹
            </button>
          )}
          {lightbox < photos.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightbox(lightbox + 1);
              }}
              className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-zinc-200 hover:bg-white/20"
            >
              ›
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[lightbox].image}
            alt={photos[lightbox].caption}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
