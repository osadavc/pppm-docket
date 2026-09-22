import { NextResponse } from "next/server";
import { env } from "@/env";
import { readObject, verifyObjectSignature } from "@/lib/storage/local";

/**
 * Serves a file from local disk storage (STORAGE_DRIVER=local), the local
 * equivalent of a Supabase signed URL. Only reachable with a signature minted
 * by /api/files/[attachmentId] after it has authorized the caller.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ bucket: string; path: string[] }> },
) {
  if (env.STORAGE_DRIVER !== "local") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { bucket, path } = await params;
  const objectPath = path.join("/");
  const search = new URL(request.url).searchParams;
  const expires = Number(search.get("expires"));
  const download = search.get("download") ?? "";
  const signature = search.get("sig") ?? "";

  if (!verifyObjectSignature(bucket, objectPath, expires, download, signature)) {
    return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 403 });
  }

  const object = await readObject(bucket, objectPath).catch(() => null);
  if (!object) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const disposition = download
    ? `attachment; filename*=UTF-8''${encodeURIComponent(download)}`
    : "inline";
  return new NextResponse(new Uint8Array(object.bytes), {
    headers: {
      "Content-Type": object.contentType,
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
    },
  });
}
