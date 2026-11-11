"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { LocalAccount } from "viem";
import { createVault, deriveKeys, openVault, type Keystore } from "@/lib/vault";

type Me = { username: string; address: `0x${string}`; keystore: Keystore };

type AccountCtx = {
  // undefined while loading, null when signed out
  me: Me | null | undefined;
  // the unlocked wallet; null after a reload until the password is entered again
  account: LocalAccount | null;
  register: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AccountCtx | null>(null);

export class AuthError extends Error {}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AuthError(data.error ?? `http_${res.status}`);
  return data;
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [account, setAccount] = useState<LocalAccount | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const { authKey, keystore, account } = await createVault(username, password);
    await post("/api/auth/register", { username, authKey, address: account.address, keystore });
    setAccount(account);
    setMe({ username, address: account.address, keystore });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { aes, authKey } = await deriveKeys(username, password);
    const data = (await post("/api/auth/login", { username, authKey })) as Me;
    setAccount(await openVault(aes, data.keystore));
    setMe(data);
  }, []);

  const unlock = useCallback(
    async (password: string) => {
      if (!me) throw new AuthError("not_signed_in");
      const { aes } = await deriveKeys(me.username, password);
      try {
        setAccount(await openVault(aes, me.keystore));
      } catch {
        throw new AuthError("wrong_password");
      }
    },
    [me],
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setAccount(null);
    setMe(null);
  }, []);

  const value = useMemo(() => ({ me, account, register, login, unlock, logout }), [me, account, register, login, unlock, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAccount outside AccountProvider");
  return c;
}
