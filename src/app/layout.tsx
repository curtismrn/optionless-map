import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Barlow, Barlow_Semi_Condensed, Archivo, IBM_Plex_Sans, IBM_Plex_Mono, DotGothic16, VT323, Anton, Permanent_Marker } from "next/font/google";
import "./globals.css";
import "./looks.css";
import { DEFAULT_LOOK, y2kDarkCss } from "@/lib/look";

const barlow = Barlow_Condensed({ subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"], variable: "--font-barlow" });
const plex = IBM_Plex_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], variable: "--font-plex" });
// design explorations (see lib/look.ts)
const barlowText = Barlow({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], variable: "--font-barlow-text" });
const barlowSemi = Barlow_Semi_Condensed({ subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"], variable: "--font-barlow-semi" });
const archivo = Archivo({ subsets: ["latin", "latin-ext"], axes: ["wdth"], variable: "--font-archivo" });
const dotGothic = DotGothic16({ subsets: ["latin"], weight: "400", variable: "--font-dotgothic" });
const vt323 = VT323({ subsets: ["latin", "latin-ext"], weight: "400", variable: "--font-vt323" });
const anton = Anton({ subsets: ["latin", "latin-ext"], weight: "400", variable: "--font-anton" });
const marker = Permanent_Marker({ subsets: ["latin"], weight: "400", variable: "--font-marker" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin", "latin-ext"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "OPTIONLESS Worldmap",
  description: "A community-built atlas of remarkable roads: passes, touge, hill climbs and rally roads, mapped and documented.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#161513",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-look={DEFAULT_LOOK} className={`${barlow.variable} ${plex.variable} ${plexMono.variable} ${barlowText.variable} ${barlowSemi.variable} ${archivo.variable} ${dotGothic.variable} ${vt323.variable} ${anton.variable} ${marker.variable}`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: y2kDarkCss() }} />
      </head>
      <body className="font-sans text-[13px]">{children}</body>
    </html>
  );
}
