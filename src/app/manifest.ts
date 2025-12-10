import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OrderWorks Admin",
    short_name: "OrderWorks",
    description: "Administer MakerWorks fabrication jobs and fulfillment.",
    start_url: "/",
    display: "standalone",
    background_color: "#030712",
    theme_color: "#0f172a",
    lang: "en",
    orientation: "portrait",
    icons: [
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
        purpose: "maskable",
      },
    ],
  };
}
