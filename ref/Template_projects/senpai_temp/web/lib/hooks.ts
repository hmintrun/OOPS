"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPublicClient, erc20Abi, http } from "viem";
import { useAccount } from "@/components/AccountProvider";
import { api } from "./api";
import { CHAIN, TOKEN } from "./config";

const publicClient = createPublicClient({ chain: CHAIN, transport: http() });

// Sends signed-out visitors back to the login screen once /api/me has answered.
export function useRequireUser() {
  const { me } = useAccount();
  const router = useRouter();
  useEffect(() => {
    if (me === null) router.replace("/");
  }, [me, router]);
  return me;
}

export function useMiuBalance(address: `0x${string}` | undefined) {
  const [value, setValue] = useState<bigint | undefined>(undefined);
  const refetch = useCallback(async () => {
    if (!address || !TOKEN.address) return;
    try {
      setValue(await publicClient.readContract({ address: TOKEN.address, abi: erc20Abi, functionName: "balanceOf", args: [address] }));
    } catch (e) {
      console.error(e);
    }
  }, [address]);
  useEffect(() => {
    refetch();
    const t = setInterval(refetch, 10_000);
    return () => clearInterval(t);
  }, [refetch]);
  return { value, refetch };
}

// GET a signed-in JSON route once the user is known; reload() refetches.
export function useData<T>(url: string | null) {
  const { me } = useAccount();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const reload = useCallback(async () => {
    if (!url) return;
    try {
      setData(await api<T>(url));
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [url]);
  useEffect(() => {
    if (me) void reload();
  }, [me, reload]);
  return { data, error, reload, setData };
}

// Seconds until `at`, ticking every second.
export function useCountdown(at: number | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return at ? Math.max(0, Math.floor((at - now) / 1000)) : 0;
}

export function hms(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
