import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zoya, Ghazala Bay — DP Interactive",
  description: "An interactive showcase of Zoya at Ghazala Bay, by DP Productions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/*
THESIS: The terrain itself is the living canvas — real aerial imagery, water, and atmosphere carried by GPU shaders, not decoration on a static map; refuses the flat-glass PropTech-dashboard default.
OWN-WORLD: Deep teal-black ground, one incandescent warm-gold accent for hovers and dusk light; oversized Geist Sans hero word against tiny tracked-out Geist Mono margin labels; a cursor-reactive shader glint and day-to-night sun sweep live on the real Mapbox/Three.js terrain and 3D masterplan.
STORY: A developer watches DP fly them from the globe into a real coastline that breathes — light shifts, the field warps toward the cursor — then selects a real building in the masterplan and trusts DP to sell this vision to buyers.
FIRST VIEWPORT: Full-bleed aerial hero over Ghazala Bay, "ZOYA" oversized centered, tiny tracked margin labels (real distances), thin corner nav, glint follows cursor.
FORM: WebGL Shader Portal (challenger, user-picked over the assigned Coastal Travel Editorial direction), seed key f7cfe282.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md.
*/}
        {children}
      </body>
    </html>
  );
}
