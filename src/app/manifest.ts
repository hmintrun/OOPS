import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "OOPS",
    short_name: "OOPS",
    description: "Cùng hàng xóm chuẩn bị và gom nhu yếu phẩm.",
    lang: "vi",
    start_url: "/groups",
    scope: "/",
    display: "standalone",
    background_color: "#eef6f0",
    theme_color: "#eef6f0",
    icons: [
      { src: "/icons/oops-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/oops-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/oops-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
