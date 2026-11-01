import type { MetadataRoute } from "next";

// Lets members add the app to their home screen and open it full screen,
// like an installed app (docs/spec.md, section 8).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Flight Club",
    short_name: "Flight Club",
    description: "Check aircraft out and in, report squawks, and see the fleet",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1e3a5f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      // Full bleed, with the aircraft inside the safe zone, for launchers
      // that crop icons to their own shape.
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
