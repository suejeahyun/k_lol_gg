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
      return NextResponse.redirect(new URL(metadata.apkUrl, request.url));
    }
  } catch {
    // Fall through to the install guide when no APK metadata exists.
  }

  return NextResponse.redirect(new URL("/install", request.url));
}
