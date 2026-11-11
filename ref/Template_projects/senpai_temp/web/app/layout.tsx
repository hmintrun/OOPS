import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Mali } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";
import "./miu.css";

const ui = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-ui",
});
const miu = Mali({
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700"],
  variable: "--font-miu",
});

export const metadata: Metadata = {
  title: "SenpAI · Luyện phỏng vấn tiếng Anh",
  description: "Phỏng vấn thử bằng giọng nói với Miu. Trả theo buổi bằng token MIU qua x402 trên Avalanche Fuji (testnet).",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FFFFFF",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${ui.variable} ${miu.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
