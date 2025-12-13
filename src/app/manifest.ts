import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OrderWorks Admin",
    short_name: "OrderWorks",
    description: "Administer MakerWorks fabrication jobs and fulfillment.",
    id: "/pwa",
    start_url: "/pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone"],
    background_color: "#030712",
    theme_color: "#0f172a",
    lang: "en",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/favicon.png",
        sizes: "1536x1536",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
