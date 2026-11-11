import { bytesToHex, hexToBytes, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// The wallet lives in the browser. From the password we derive 64 bytes with
// PBKDF2: the first half encrypts the private key (AES-GCM), the second half is
// the `authKey` we log in with. The server stores the ciphertext and a hash of
// the authKey, so it can check logins but never open the wallet.
// Lose the password and the wallet is gone: there is no email to recover it.

export type Keystore = { v: 1; iv: string; ct: string };

const ITERATIONS = 600_000;
const enc = new TextEncoder();
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(username: string, password: string) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(`senpai/v1/${username.trim().toLowerCase()}`), iterations: ITERATIONS },
      base,
      512,
    ),
  );
  const aes = await crypto.subtle.importKey("raw", bits.slice(0, 32), "AES-GCM", false, ["encrypt", "decrypt"]);
  return { aes, authKey: bytesToHex(bits.slice(32)).slice(2) };
}

export async function createVault(username: string, password: string) {
  const { aes, authKey } = await derive(username, password);
  const privateKey = generatePrivateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, new Uint8Array(hexToBytes(privateKey))));
  const keystore: Keystore = { v: 1, iv: b64(iv), ct: b64(ct) };
  return { authKey, keystore, account: privateKeyToAccount(privateKey) };
}

export const deriveKeys = derive;

export async function openVault(aes: CryptoKey, keystore: Keystore) {
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(keystore.iv) }, aes, unb64(keystore.ct));
  return privateKeyToAccount(bytesToHex(new Uint8Array(raw)) as Hex);
}
