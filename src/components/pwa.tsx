"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Button, Card, CardTitle, MaterialSymbol } from "@/components/ui";

type InstallPrompt = Event & { prompt(): Promise<unknown> };
type InstallPlatform = "ios" | "android" | "other";
const InstallContext = createContext<{
  prompt: InstallPrompt | null;
  installed: boolean;
  platform: InstallPlatform;
  install: () => Promise<void>;
}>({ prompt: null, installed: false, platform: "other", install: async () => {} });

export function PwaProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>("other");
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const updateMode = () => setInstalled(
      standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
    const updateConnection = () => setOffline(!navigator.onLine);
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setPrompt(null);
      setInstalled(true);
    };

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setPlatform(isIOS ? "ios" : /Android/.test(navigator.userAgent) ? "android" : "other");
    updateMode();
    updateConnection();
    standalone.addEventListener("change", updateMode);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", onInstalled);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(error => {
        console.warn("OOPS: không đăng ký được service worker.", error);
      });
    }

    return () => {
      standalone.removeEventListener("change", updateMode);
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    setPrompt(null);
    try {
      await prompt.prompt();
    } catch {
      // Hướng dẫn cài bằng menu trình duyệt vẫn hiện.
    }
  }

  return (
    <InstallContext.Provider value={{ prompt, installed, platform, install }}>
      <div className="pwa-connection" role="status">
        {offline && <p><MaterialSymbol name="wifi_off" size={20} /> Mất kết nối. Kết nối lại để gửi hoặc cập nhật thông tin.</p>}
      </div>
      {children}
    </InstallContext.Provider>
  );
}

export function PwaInstallCard() {
  const { prompt, installed, platform, install } = useContext(InstallContext);
  if (installed) return null;

  return (
    <Card className="pwa-install-card">
      <CardTitle as="h2">Cài OOPS</CardTitle>
      {prompt ? (
        <Button full={false} onClick={() => void install()}>
          <MaterialSymbol name="install_mobile" size={20} />
          Thêm vào màn hình chính
        </Button>
      ) : platform === "ios" ? (
        <p>Trong Safari, chọn <strong>Chia sẻ → Thêm vào MH chính</strong>.</p>
      ) : platform === "android" ? (
        <p>Trong Chrome, mở <strong>⋮ → Cài đặt ứng dụng</strong> hoặc <strong>Thêm vào màn hình chính</strong>, rồi chọn <strong>Cài đặt</strong>.</p>
      ) : (
        <p>Mở menu trình duyệt và chọn <strong>Cài đặt ứng dụng</strong> hoặc <strong>Thêm vào màn hình chính</strong>.</p>
      )}
    </Card>
  );
}
