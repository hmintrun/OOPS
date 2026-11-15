"use client";

import { useEffect, useState } from "react";
import type { Hex } from "viem";
import {
  ApiError,
  getMe,
  getWalletChallenge,
  linkWallet,
  newIdempotencyKey,
  type Me,
} from "@/lib/api-client";
import {
  formatFujiWalletError,
  getInjectedWalletProvider,
  sendProveWalletTransaction,
  txExplorerUrl,
} from "@/lib/fuji/browser";
import { Button } from "@/components/ui";

type PendingProof = {
  address: string;
  proofTx: string;
  nonce: string;
  idempotencyKey: string;
};

type StepPhase = "idle" | "challenge" | "signing" | "verifying" | "done";

export function WalletLinkModal({
  currentAddress,
  onData,
  onUnauthorized,
}: {
  currentAddress?: string;
  onData?: (next: Me) => void;
  onUnauthorized?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hasProvider, setHasProvider] = useState(true);
  const [phase, setPhase] = useState<StepPhase>("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [proof, setProof] = useState<PendingProof | null>(null);

  useEffect(() => {
    setHasProvider(getInjectedWalletProvider() !== null);
  }, [open]);

  function openModal() {
    setError("");
    setNotice("");
    setHasProvider(getInjectedWalletProvider() !== null);
    setOpen(true);
  }

  async function submitProofToServer(nextProof: PendingProof) {
    setPhase("verifying");
    await linkWallet(
      {
        address: nextProof.address,
        proofTx: nextProof.proofTx,
        nonce: nextProof.nonce,
      },
      nextProof.idempotencyKey,
    );
    const updated = await getMe();
    onData?.(updated);
    setProof(null);
    setPhase("done");
    setNotice("Đã liên kết và xác minh ví Core Wallet trên Avalanche Fuji.");
    setOpen(false);
  }

  async function runLinkFlow() {
    setError("");
    setNotice("");
    try {
      if (proof) {
        await submitProofToServer(proof);
        return;
      }

      setPhase("challenge");
      const challenge = await getWalletChallenge();

      setPhase("signing");
      const { address, txHash } = await sendProveWalletTransaction({
        contractAddress: challenge.contractAddress,
        challengeHash: challenge.challengeHash as Hex,
      });

      const nextProof: PendingProof = {
        address,
        proofTx: txHash,
        nonce: challenge.nonce,
        idempotencyKey: newIdempotencyKey(),
      };
      setProof(nextProof);

      await submitProofToServer(nextProof);
    } catch (err) {
      setPhase("idle");
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized?.();
        return;
      }
      setError(err instanceof ApiError ? err.message : formatFujiWalletError(err));
    }
  }

  const busy = phase === "challenge" || phase === "signing" || phase === "verifying";

  return (
    <div className="grid gap-2">
      <Button
        variant={currentAddress ? "secondary" : "primary"}
        full={false}
        onClick={openModal}
        data-testid="open-wallet-link"
      >
        {currentAddress ? "Đổi ví Core Wallet" : "Liên kết ví Core Wallet"}
      </Button>
      {notice && <p className="me-notice">{notice}</p>}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wallet-link-title"
        >
          <div className="grid w-full max-w-md gap-4 rounded-card border border-line bg-surface p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="wallet-link-title" className="text-lg font-bold text-navy-900">
                  {currentAddress ? "Đổi ví Avalanche Fuji" : "Liên kết Core Wallet (Fuji)"}
                </h3>
                <p className="text-small text-navy-600">
                  Xác thực quyền sở hữu ví on-chain trên mạng Avalanche Fuji (Chain ID: 43113).
                </p>
              </div>
              <button
                type="button"
                className="rounded-input px-2 py-1 text-small font-semibold text-navy-600 hover:bg-sky-tint"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Đóng
              </button>
            </div>

            {!hasProvider && (
              <div className="rounded-input bg-sun-tint p-3 text-small text-navy-900">
                <p className="font-semibold">Chưa phát hiện tiện ích Core Wallet trên trình duyệt này.</p>
                <p className="mt-1">
                  Cài tiện ích{" "}
                  <a
                    href="https://core.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline"
                  >
                    Core Wallet
                  </a>{" "}
                  và nhận AVAX thử nghiệm miễn phí tại{" "}
                  <a
                    href="https://core.app/tools/testnet-faucet/?subnet=c&token=c"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline"
                  >
                    Core Testnet Faucet
                  </a>
                  .
                </p>
              </div>
            )}

            <ol className="grid gap-2 rounded-input bg-sky-tint p-3 text-small text-navy-900">
              <li className={phase === "challenge" ? "font-bold text-green-700" : ""}>
                1. Nhận thử thách một lần từ hệ thống OOPS
              </li>
              <li className={phase === "signing" ? "font-bold text-green-700" : ""}>
                2. Mở Core Wallet, chuyển sang Fuji (43113) và ký giao dịch proveWallet
              </li>
              <li className={phase === "verifying" ? "font-bold text-green-700" : ""}>
                3. Xác minh biên nhận giao dịch và cập nhật trạng thái đủ điều kiện
              </li>
            </ol>

            {proof && (
              <p className="text-small text-green-700">
                Giao dịch đã ghi on-chain:{" "}
                <a
                  href={txExplorerUrl(proof.proofTx)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono underline"
                >
                  {proof.proofTx.slice(0, 10)}…{proof.proofTx.slice(-8)}
                </a>
              </p>
            )}

            {error && (
              <p role="alert" className="me-error">
                {error}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" full={false} disabled={busy} onClick={() => setOpen(false)}>
                Huỷ
              </Button>
              <Button loading={busy} full={false} onClick={() => void runLinkFlow()}>
                {proof ? "Gửi lại xác minh" : currentAddress ? "Ký đổi ví trên Core Wallet" : "Kết nối & Ký trên Core Wallet"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
