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
import {
  embeddedFujiConfigured,
  sendEmbeddedFujiCall,
  waitForEmbeddedFujiCall,
  type SponsoredFujiCall,
} from "@/lib/fuji/embedded";

type PendingProof = {
  address: string;
  proofTx: string;
  nonce: string;
  idempotencyKey: string;
  expiresAt: string;
};

type WalletMethod = "core" | "embedded";
type SponsoredProof = SponsoredFujiCall & { nonce: string; expiresAt: string };

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
  const [sponsored, setSponsored] = useState<SponsoredProof | null>(null);
  const [method, setMethod] = useState<WalletMethod>("core");
  const embeddedEnabled = embeddedFujiConfigured();
  const embedded = method === "embedded";

  useEffect(() => {
    setHasProvider(getInjectedWalletProvider() !== null);
  }, [open]);

  function openModal(nextMethod: WalletMethod) {
    if (!proof && !sponsored) setMethod(nextMethod);
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
    setNotice("Đã xác minh ví. Bạn có thể kiểm tra điều kiện xác nhận ở trang Tài khoản.");
    setOpen(false);
  }

  async function verifySponsoredProof(pending: SponsoredProof) {
    const txHash = await waitForEmbeddedFujiCall(pending.id);
    setSponsored(null);
    if (!txHash) throw new Error("Giao dịch thử không thành công. Vui lòng xác nhận lại.");
    const nextProof = {
      address: pending.address,
      proofTx: txHash,
      nonce: pending.nonce,
      expiresAt: pending.expiresAt,
      idempotencyKey: newIdempotencyKey(),
    };
    setProof(nextProof);
    await submitProofToServer(nextProof);
  }

  async function runLinkFlow() {
    setError("");
    setNotice("");
    try {
      if (proof && Date.parse(proof.expiresAt) > Date.now()) {
        await submitProofToServer(proof);
        return;
      }
      if (sponsored && Date.parse(sponsored.expiresAt) > Date.now()) {
        setPhase("signing");
        await verifySponsoredProof(sponsored);
        return;
      }
      setProof(null);
      setSponsored(null);

      setPhase("challenge");
      const challenge = await getWalletChallenge();

      setPhase("signing");
      const call = {
        contractAddress: challenge.contractAddress,
        challengeHash: challenge.challengeHash as Hex,
      };
      if (embedded) {
        const operation = await sendEmbeddedFujiCall(call);
        const pending = { ...operation, nonce: challenge.nonce, expiresAt: challenge.expiresAt };
        setSponsored(pending);
        await verifySponsoredProof(pending);
        return;
      }

      const { address, txHash } = await sendProveWalletTransaction(call);

      const nextProof: PendingProof = {
        address,
        proofTx: txHash,
        nonce: challenge.nonce,
        expiresAt: challenge.expiresAt,
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
      {embeddedEnabled && (
        <Button
          variant={currentAddress ? "secondary" : "primary"}
          full={false}
          onClick={() => openModal("embedded")}
          data-testid="open-embedded-wallet"
        >
          {currentAddress ? "Dùng ví tích hợp OOPS" : "Thiết lập xác nhận trong OOPS"}
        </Button>
      )}
      <Button
        variant={currentAddress || embeddedEnabled ? "secondary" : "primary"}
        full={false}
        onClick={() => openModal("core")}
        data-testid="open-wallet-link"
      >
        {currentAddress ? "Đổi ví Core Wallet" : "Liên kết ví Core Wallet"}
      </Button>
      {notice && <p className="me-notice">{notice}</p>}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wallet-link-title"
        >
          <div className="grid max-h-full w-full min-w-0 max-w-md grid-cols-[minmax(0,1fr)] gap-4 overflow-y-auto overscroll-contain rounded-card border border-line bg-surface p-5 shadow-xl [overflow-wrap:anywhere]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id="wallet-link-title" className="text-lg font-bold text-navy-900">
                  {embedded ? "Thiết lập ví OOPS" : currentAddress ? "Đổi ví Avalanche Fuji" : "Liên kết Core Wallet (Fuji)"}
                </h3>
                <p className="text-small text-navy-600">
                  {embedded
                    ? "Dùng tài khoản OOPS để thiết lập ví xác nhận. Phí giao dịch thử được tài trợ."
                    : "Xác thực quyền sở hữu ví on-chain trên mạng Avalanche Fuji (Chain ID: 43113)."}
                </p>
              </div>
              <button
                type="button"
                className="min-h-11 shrink-0 self-start whitespace-nowrap rounded-input px-2 text-small font-semibold text-navy-600 hover:bg-sky-tint"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Đóng
              </button>
            </div>

            {!embedded && !hasProvider && (
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

            {embedded && currentAddress && (
              <p className="text-small text-navy-600">
                Nếu ví OOPS có địa chỉ khác, thao tác này sẽ đổi ví. OOPS sẽ chặn đổi ví khi bạn còn nghĩa vụ với đơn.
              </p>
            )}
            {embedded ? (
              busy && <p role="status" className="text-small text-navy-600">
                {phase === "verifying" ? "Đang xác minh ví…" : "Đang chuẩn bị xác nhận trên Fuji…"}
              </p>
            ) : (
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
            )}

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

            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:justify-self-end">
              <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                Huỷ
              </Button>
              <Button loading={busy} onClick={() => void runLinkFlow()}>
                {proof ? "Gửi lại xác minh"
                  : sponsored ? "Kiểm tra giao dịch"
                    : embedded ? "Xác minh ví OOPS"
                      : currentAddress ? "Ký đổi ví trên Core Wallet" : "Kết nối & Ký trên Core Wallet"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
