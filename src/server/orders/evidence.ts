import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { PoolClient } from "pg";
import { requiredEnv } from "../config";
import { transaction } from "../db";
import { ApiFailure, conflict, forbidden, invalid, notFound, unavailable } from "../errors";
import { assertHandoffOpen, requireOrderParty } from "./handoff";
import { findOrder, requireHandoffParty } from "./records";

const maxBytes = 5 * 1024 * 1024;
const signedUrlSeconds = 300;
const oversize = () => new ApiFailure(413, "PAYLOAD_TOO_LARGE", "Ảnh vượt giới hạn 5 MiB.");

async function storageBucket() {
  const storage = createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;
  const name = requiredEnv("OOPS_EVIDENCE_BUCKET");
  const { data, error } = await storage.getBucket(name);
  if (error || data?.public !== false) throw unavailable();
  return storage.from(name);
}

async function readPhoto(request: Request) {
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data;") || !request.body) throw invalid("Cần gửi ảnh qua multipart/form-data.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes + 64 * 1024) {
        await reader.cancel().catch(() => undefined);
        throw oversize();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const form = await new Response(Buffer.concat(chunks), { headers: { "content-type": contentType } }).formData()
    .catch(() => { throw invalid("Nội dung ảnh không hợp lệ."); });
  const file = form.get("file");
  if (!(file instanceof File) || form.getAll("file").length !== 1) throw invalid("Cần đúng một ảnh trong trường file.");
  if (file.size > maxBytes) throw oversize();
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" ? "image/png"
    : bytes.subarray(0, 3).toString("hex") === "ffd8ff" ? "image/jpeg"
    : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP" ? "image/webp"
    : undefined;
  if (!mime || file.type !== mime) throw invalid("Chỉ nhận ảnh PNG, JPEG hoặc WebP hợp lệ.");
  return { bytes, mime };
}

function evidenceId(contractId: string, actorId: string, key: string | null) {
  if (key === null) return randomUUID();
  if (!key.trim() || key.length > 255) throw invalid("Idempotency-Key không hợp lệ.");
  const hash = createHash("sha256").update(JSON.stringify([contractId, actorId, key])).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function knownUpload(db: PoolClient, id: string, key: string) {
  const { rows: [row] } = await db.query<{ object_key: string }>("select object_key from public.evidence where id = $1", [id]);
  if (row && row.object_key !== key) throw conflict("Khóa idempotency đã được dùng cho ảnh khác.");
  return Boolean(row);
}

export async function uploadEvidence(request: Request, actorId: string, contractId: string) {
  await transaction(db => requireOrderParty(db, actorId, contractId, "SELLER"), true);
  const id = evidenceId(contractId, actorId, request.headers.get("idempotency-key"));
  const { bytes, mime } = await readPhoto(request);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const key = `${contractId}/${id}/${sha}`;
  const alreadySaved = await transaction(async db => {
    if (await knownUpload(db, id, key)) return true;
    assertHandoffOpen(await findOrder(db, contractId));
    return false;
  }, true);
  if (alreadySaved) return { evidenceId: id };

  const bucket = await storageBucket();
  const { error } = await bucket.upload(key, bytes, { contentType: mime, upsert: false });
  if (error && String((error as { statusCode?: string | number }).statusCode) !== "409") throw unavailable();

  return transaction(async db => {
    const order = await findOrder(db, contractId, true);
    if (requireHandoffParty(order, actorId) !== "SELLER") throw forbidden();
    if (await knownUpload(db, id, key)) return { evidenceId: id };
    assertHandoffOpen(order);
    await db.query(
      "insert into public.evidence (id, contract_id, uploaded_by, object_key) values ($1, $2, $3, $4)",
      [id, contractId, actorId, key],
    );
    await db.query("update public.contracts set version = version + 1 where id = $1", [contractId]);
    return { evidenceId: id };
  }).catch(async failure => {
    if (!error && failure instanceof ApiFailure) await bucket.remove([key]).catch(() => undefined);
    throw failure;
  });
}

export async function signEvidence(actorId: string, id: string) {
  const key = await transaction(async db => {
    const { rows: [row] } = await db.query<{ contract_id: string; object_key: string }>(
      "select contract_id, object_key from public.evidence where id = $1", [id],
    );
    if (!row) throw notFound();
    await requireOrderParty(db, actorId, row.contract_id);
    return row.object_key;
  }, true);
  const expiresAt = new Date(Date.now() + signedUrlSeconds * 1000).toISOString();
  const { data, error } = await (await storageBucket()).createSignedUrl(key, signedUrlSeconds);
  if (error || !data?.signedUrl) throw unavailable();
  return { url: data.signedUrl, expiresAt };
}
