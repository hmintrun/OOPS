"use client";

import { AccountProvider } from "@/components/AccountProvider";
import { TOKEN } from "@/lib/config";

export function Providers({ children }: { children: React.ReactNode }) {
  if (!TOKEN.address) {
    return (
      <main className="screen">
        <h1 className="h1" style={{ marginTop: 60, fontSize: 28 }}>
          Chưa có token MIU
          <span className="hot">Chạy setup trước đã</span>
        </h1>
        <p className="muted" style={{ fontSize: 16, lineHeight: "23px" }}>
          Chạy <span className="mono">npm run setup</span>, nạp AVAX test cho ví relayer, rồi <span className="mono">npm run token:deploy</span>. Xem README.
        </p>
      </main>
    );
  }
  return <AccountProvider>{children}</AccountProvider>;
}
