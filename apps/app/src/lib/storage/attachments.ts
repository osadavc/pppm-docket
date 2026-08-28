import "server-only";

import { randomUUID } from "node:crypto";
import { assertStorageConfigured, BUCKET, storage } from "./supabase";

/** PDF and Word only — the formats a CV actually arrives in. */
export const ALLOWED_CV_TYPES = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
} as const;

export const MAX_CV_BYTES = 5 * 1024 * 1024; // 5 MB

export type CvValidationError =
  | { code: "empty"; message: string }
  | { code: "type"; message: string }
  | { code: "size"; message: string };

/**
 * Validated server-side against the real file, never against a client-supplied
 * name or content-type alone — the accept attribute on an input is a hint to
 * the file picker, not a control.
 */
export function validateCvFile(file: File): CvValidationError | null {
  if (!file || file.size === 0) {
    return { code: "empty", message: "Choose a CV file to upload." };
  }
  if (!(file.type in ALLOWED_CV_TYPES)) {
    return {
      code: "type",
      message: "The CV must be a PDF or Word document (.pdf, .doc, .docx).",
    };
  }
  if (file.size > MAX_CV_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return {
      code: "size",
      message: `That file is ${mb} MB. The limit is ${MAX_CV_BYTES / 1024 / 1024} MB.`,
    };
  }
  return null;
}

export function buildCvPath(candidateId: string, file: File) {
  const extension =
    ALLOWED_CV_TYPES[file.type as keyof typeof ALLOWED_CV_TYPES] ?? "bin";
  return `candidates/${candidateId}/${randomUUID()}.${extension}`;
}

export async function uploadCv(path: string, file: File) {
  const notConfigured = assertStorageConfigured();
  if (notConfigured) return { ok: false as const, error: notConfigured };

  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await storage.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    return { ok: false as const, error: `Could not store the CV: ${error.message}` };
  }
  return { ok: true as const };
}

export async function removeCv(path: string, bucket: string = BUCKET) {
  await storage.storage.from(bucket).remove([path]).catch(() => undefined);
}

/**
 * Short-lived signed URL. The bucket is private, so this is the only way to
 * read a file — and it is minted only after the caller has been authorized.
 */
export async function createCvSignedUrl(
  path: string,
  fileName: string,
  bucket: string = BUCKET,
) {
  const notConfigured = assertStorageConfigured();
  if (notConfigured) return { ok: false as const, error: notConfigured };

  const { data, error } = await storage.storage
    .from(bucket)
    .createSignedUrl(path, 60, { download: fileName });

  if (error || !data?.signedUrl) {
    return { ok: false as const, error: error?.message ?? "Could not sign the file URL." };
  }
  return { ok: true as const, url: data.signedUrl };
}
