import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type AndroidReleaseInfo = {
  available?: boolean;
  apkUrl?: string | null;
};

export async function GET(request: Request) {
  try {
    const metadataPath = join(process.cwd(), "public", "downloads", "android", "latest.json");
    const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as AndroidReleaseInfo;

    if (metadata.available && metadata.apkUrl?.startsWith("/downloads/android/")) {
      const response = NextResponse.redirect(new URL(metadata.apkUrl, request.url));
      response.headers.set("Cache-Control", "no-store, max-age=0");
      return response;
    }
  } catch {
    // Fall through to the install guide when no APK metadata exists.
  }

  const response = NextResponse.redirect(new URL("/install", request.url));
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
