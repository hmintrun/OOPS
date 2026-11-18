"use client";

import { useEffect, useState } from "react";
import type { Hex } from "viem";
import type { confirmationRound } from "@/contracts/negotiation";
import type { z } from "zod";
import { ApiError } from "@/lib/api-client";
import {
  formatFujiWalletError,
  sendConfirmVersionTransaction,
  txExplorerUrl,
} from "@/lib/fuji/browser";
import { Button } from "@/components/ui";
import { embeddedFujiConfigured, sendEmbeddedFujiCall, waitForEmbeddedFujiCall } from "@/lib/fuji/embedded";

type RoundData = z.infer<typeof confirmationRound>;
export type WalletConfirmMethod = "embedded" | "core";

export function confirmButtonStates(input: {
  disabled: boolean;
  signingMethod: WalletConfirmMethod | null;
  submittedTx: string;
  submittedMethod: WalletConfirmMethod | null;
  sponsoredId: string;
}) {
  const { disabled, signingMethod, submittedTx, submittedMethod, sponsoredId } = input;
  const hasSubmitted = Boolean(submittedTx);
  return {
    embedded: {
      loading: signingMethod === "embedded",
      disabled: disabled || hasSubmitted || signingMethod === "core",
      label:
        hasSubmitted && submittedMethod === "embedded"
          ? "Đang ghi nhận xác nhận…"
          : sponsoredId
            ? "Kiểm tra giao dịch"
            : "Xác nhận mua trong OOPS",
    },
    core: {
      loading: signingMethod === "core",
      disabled: disabled || hasSubmitted || Boolean(sponsoredId) || signingMethod === "embedded",
      label:
        hasSubmitted && submittedMethod === "core"
          ? "Đã ký trên Fuji — đang đồng bộ…"
          : "Ký xác nhận trên Core Wallet",
    },
  };
}

export function FujiConfirmButton({
  round,
  disabled,
  onConfirmed,
}: {
  round: RoundData;
  disabled: boolean;
  onConfirmed: () => Promise<void> | void;
}) {
  const [signingMethod, setSigningMethod] = useState<WalletConfirmMethod | null>(null);
  const [submittedTx, setSubmittedTx] = useState<string>("");
  const [submittedMethod, setSubmittedMethod] = useState<WalletConfirmMethod | null>(null);
  const [sponsoredId, setSponsoredId] = useState("");
  const embeddedEnabled = embeddedFujiConfigured();
  const [error, setError] = useState<string>("");

  const walletAddress = round.myConfirmation?.walletAddress;
  const stillPending = round.state === "OPEN" && round.myConfirmation?.state === "PENDING";

  // Sau khi giao dịch confirmVersion lên Fuji thành công, worker cần vài giây để index event vào DB.
  useEffect(() => {
    if (!submittedTx || !stillPending) return;
    let cancelled = false;
    let ticks = 0;
    const timer = setInterval(() => {
      if (cancelled || ticks >= 5) {
        clearInterval(timer);
        return;
      }
      ticks += 1;
      void onConfirmed();
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [submittedTx, stillPending, onConfirmed]);

  if (!stillPending || !walletAddress) return null;

  const buttons = confirmButtonStates({
    disabled,
    signingMethod,
    submittedTx,
    submittedMethod,
    sponsoredId,
  });

  async function handleConfirm(method: WalletConfirmMethod) {
    if (!walletAddress) return;
    setError("");
    setSigningMethod(method);
    try {
      const call = {
        contractAddress: round.contractAddress,
        roundKey: round.roundKey as Hex,
        versionHash: round.versionHash as Hex,
        expectedWalletAddress: walletAddress,
      };
      let txHash: Hex;
      if (method === "embedded") {
        const id = sponsoredId || (await sendEmbeddedFujiCall(call)).id;
        setSponsoredId(id);
        const confirmedTx = await waitForEmbeddedFujiCall(id);
        setSponsoredId("");
        if (!confirmedTx) throw new Error("Giao dịch thử không thành công. Vui lòng xác nhận lại.");
        txHash = confirmedTx;
      } else {
        ({ txHash } = await sendConfirmVersionTransaction(call));
      }
      setSubmittedMethod(method);
      setSubmittedTx(txHash);
      await onConfirmed();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.assign("/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : formatFujiWalletError(err));
    } finally {
      setSigningMethod(null);
    }
  }

  return (
    <div className="grid gap-2">
      <p className="text-small text-navy-600">
        Ví hộ trong snapshot:{" "}
        <span className="font-mono font-semibold text-navy-900">
          {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {embeddedEnabled && (
          <Button
            full={false}
            loading={buttons.embedded.loading}
            disabled={buttons.embedded.disabled}
            onClick={() => void handleConfirm("embedded")}
          >
            {buttons.embedded.label}
          </Button>
        )}
        <Button
          full={false}
          variant={embeddedEnabled ? "secondary" : "primary"}
          loading={buttons.core.loading}
          disabled={buttons.core.disabled}
          onClick={() => void handleConfirm("core")}
        >
          {buttons.core.label}
        </Button>
      </div>
      {submittedTx && (
        <p className="text-small text-green-700">
          Giao dịch{" "}
          <a
            href={txExplorerUrl(submittedTx)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono underline"
          >
            {submittedTx.slice(0, 10)}…{submittedTx.slice(-8)}
          </a>{" "}
          đã ghi trên Fuji. Hệ thống đang đồng bộ trạng thái chính thức; nếu chưa tự cập nhật sau vài giây hãy bấm
          Cập nhật xác nhận.
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger text-small">
          {error}
        </p>
      )}
    </div>
  );
}
