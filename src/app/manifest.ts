import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Noctis",
    short_name: "Noctis",
    description: "Follow soccer teams, players and leagues. Live scores and authorized streams.",
    start_url: "/live",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#faf9fc",
    theme_color: "#faf9fc",
    categories: ["sports"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
