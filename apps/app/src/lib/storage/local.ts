import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/env";

/**
 * Disk-backed stand-in for Supabase Storage, used when STORAGE_DRIVER=local.
 *
 * It mirrors the slice of `supabase.storage.from(bucket)` the app calls -
 * upload, remove, createSignedUrl, so nothing above lib/storage changes.
 * Files live under LOCAL_STORAGE_DIR/<bucket>/<path>; the "signed URL" points
 * at /api/storage and carries an HMAC over (bucket, path, expiry, download
 * name), keyed by BETTER_AUTH_SECRET, so it is as short-lived and unguessable
 * as the Supabase one.
 */
const root = path.resolve(env.LOCAL_STORAGE_DIR);

type StorageError = { message: string } | null;

/** Resolves an object path inside the storage root, refusing `..` escapes. */
export function resolveObject(bucket: string, objectPath: string) {
  const full = path.resolve(root, bucket, objectPath);
  if (!full.startsWith(root + path.sep)) {
    throw new Error("Invalid storage path.");
  }
  return full;
}

export function signObject(bucket: string, objectPath: string, expires: number, download: string) {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`${bucket}\n${objectPath}\n${expires}\n${download}`)
    .digest("base64url");
}

export function verifyObjectSignature(
  bucket: string,
  objectPath: string,
  expires: number,
  download: string,
  signature: string,
) {
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = Buffer.from(signObject(bucket, objectPath, expires, download));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function readObject(bucket: string, objectPath: string) {
  const full = resolveObject(bucket, objectPath);
  const [bytes, meta] = await Promise.all([
    readFile(full),
    readFile(`${full}.meta.json`, "utf8")
      .then((m) => JSON.parse(m) as { contentType?: string })
      .catch(() => ({ contentType: undefined })),
  ]);
  return { bytes, contentType: meta.contentType ?? "application/octet-stream" };
}

function bucketApi(bucket: string) {
  return {
    async upload(
      objectPath: string,
      bytes: Buffer,
      options: { contentType?: string; upsert?: boolean } = {},
    ): Promise<{ error: StorageError }> {
      try {
        const full = resolveObject(bucket, objectPath);
        await mkdir(path.dirname(full), { recursive: true });
        await writeFile(full, bytes, { flag: options.upsert ? "w" : "wx" });
        await writeFile(`${full}.meta.json`, JSON.stringify({ contentType: options.contentType }));
        return { error: null };
      } catch (e) {
        return { error: { message: (e as Error).message } };
      }
    },

    async remove(paths: string[]): Promise<{ error: StorageError }> {
      for (const p of paths) {
        const full = resolveObject(bucket, p);
        await rm(full, { force: true });
        await rm(`${full}.meta.json`, { force: true });
      }
      return { error: null };
    },

    async createSignedUrl(
      objectPath: string,
      expiresInSeconds: number,
      options: { download?: string } = {},
    ): Promise<{ data: { signedUrl: string } | null; error: StorageError }> {
      const expires = Date.now() + expiresInSeconds * 1000;
      const download = options.download ?? "";
      const url = new URL(
        `/api/storage/${encodeURIComponent(bucket)}/${objectPath.split("/").map(encodeURIComponent).join("/")}`,
        env.NEXT_PUBLIC_APP_URL,
      );
      url.searchParams.set("expires", String(expires));
      if (download) url.searchParams.set("download", download);
      url.searchParams.set("sig", signObject(bucket, objectPath, expires, download));
      return { data: { signedUrl: url.toString() }, error: null };
    },
  };
}

export function createLocalStorageClient() {
  return { storage: { from: bucketApi } };
}
