import type { NextConfig } from "next";
import { withPayload } from "@payloadcms/next/withPayload";

const nextConfig: NextConfig = {
  images: {
    // Client logos are uploaded through /admin and served from Vercel Blob's CDN.
    // next/image refuses any remote host that isn't listed here (400), which silently
    // breaks every wordmark the moment a logo comes from the CMS rather than public/.
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
};

export default withPayload(nextConfig);
