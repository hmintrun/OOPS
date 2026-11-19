import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PwaProvider } from "@/components/pwa";
import { ErrorToastProvider } from "@/components/ui/error-toast";
import { NotificationProvider } from "@/components/notifications";
import "./globals.css";

export const metadata: Metadata = {
  title: "OOPS",
  description: "Gom nhu yếu phẩm theo nhóm, chốt hợp đồng có cọc và xác nhận trên Fuji.",
  applicationName: "OOPS",
  icons: { icon: "/icons/oops-192.png", apple: "/icons/oops-apple.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#cfe8d4",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" style={{ backgroundColor: "#cfe8d4", colorScheme: "light" }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,500,0..1,0&display=block"
          rel="stylesheet"
        />
      </head>
      <body><PwaProvider><ErrorToastProvider><NotificationProvider>{children}</NotificationProvider></ErrorToastProvider></PwaProvider></body>
    </html>
  );
}
