// Media manifest for the Zoya showcase. Files are NOT bundled in this repo yet — drop
// real DP Productions aerial photography/video into public/media/zoya/aerial/ using
// these exact filenames and they appear automatically; until then ZoyaAsset renders an
// honest "awaiting asset" placeholder instead of a fabricated photo.

export type ZoyaMediaAsset = { file: string; caption: string };

export const ZOYA_AERIAL_DIR = "/media/zoya/aerial";
export const ZOYA_CONSTRUCTION_DIR = "/media/zoya/construction";

export const ZOYA_HERO_VIDEO = `${ZOYA_AERIAL_DIR}/flythrough.mp4`;
export const ZOYA_HERO_IMAGE = `${ZOYA_AERIAL_DIR}/hero.jpg`;

export const ZOYA_AERIAL_PHOTOS: ZoyaMediaAsset[] = [
  { file: "coastline.jpg", caption: "Ghazala Bay coastline" },
  { file: "clubhouse.jpg", caption: "Clubhouse & marina" },
  { file: "site-overview.jpg", caption: "Site overview" },
];
