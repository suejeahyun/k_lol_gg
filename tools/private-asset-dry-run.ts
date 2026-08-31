import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma/client";
import { getPrivateBlobAuthOptions } from "../src/lib/storage/private-assets";
import { runPrivateAssetDryRun } from "../src/lib/storage/private-asset-reconciler";

const DB_PAGE_SIZE = 250;
const MAX_DB_PAGES = 100;
const BLOB_PAGE_SIZE = 1000;
const MAX_BLOB_PAGES = 100;
const BLOB_PAGE_TIMEOUT_MS = 10_000;
const BLOB_PAGE_MAX_RETRIES = 2;

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("bounded read timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function listPrivateObjectKeys() {
  const { list } = await import("@vercel/blob");
  const keys: string[] = [];
  let cursor: string | undefined;

  for (let pageNumber = 1; pageNumber <= MAX_BLOB_PAGES; pageNumber += 1) {
    let page: Awaited<ReturnType<typeof list>> | undefined;
    for (let attempt = 0; attempt <= BLOB_PAGE_MAX_RETRIES; attempt += 1) {
      try {
        page = await withTimeout(
          list({
            ...getPrivateBlobAuthOptions(),
            prefix: "private/",
            limit: BLOB_PAGE_SIZE,
            cursor,
          }),
          BLOB_PAGE_TIMEOUT_MS,
        );
        break;
      } catch {
        if (attempt === BLOB_PAGE_MAX_RETRIES) throw new Error("bounded Blob read failed");
      }
    }
    if (!page) throw new Error("bounded Blob read failed");
    keys.push(...page.blobs.map((blob) => blob.pathname));
    if (!page.hasMore) return keys;
    if (!page.cursor || page.cursor === cursor) throw new Error("Blob pagination did not advance");
    cursor = page.cursor;
  }

  throw new Error("Blob page limit exceeded");
}

async function listPrivateAssetMetadata() {
  const assets: Array<{
    storageKey: string;
    expiresAt: Date | null;
    deletedAt: Date | null;
    relationCount: number;
  }> = [];
  let cursorId: number | undefined;

  for (let pageNumber = 1; pageNumber <= MAX_DB_PAGES; pageNumber += 1) {
    const rows = await prisma.privateAsset.findMany({
      orderBy: { id: "asc" },
      take: DB_PAGE_SIZE,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        storageKey: true,
        expiresAt: true,
        deletedAt: true,
        _count: {
          select: {
            disciplineEvidence: true,
            inhouseImages: true,
            inboundImages: true,
          },
        },
      },
    });
    assets.push(...rows.map((row) => ({
      storageKey: row.storageKey,
      expiresAt: row.expiresAt,
      deletedAt: row.deletedAt,
      relationCount:
        row._count.disciplineEvidence + row._count.inhouseImages + row._count.inboundImages,
    })));
    if (rows.length < DB_PAGE_SIZE) return assets;
    cursorId = rows.at(-1)?.id;
    if (!cursorId) throw new Error("DB pagination did not advance");
  }

  throw new Error("DB page limit exceeded");
}

async function main() {
  const outputPath = process.argv.find((arg) => arg.startsWith("--out="))?.slice(6);
  const manifest = await runPrivateAssetDryRun({
    listAssetMetadata: listPrivateAssetMetadata,
    listObjectKeys: listPrivateObjectKeys,
  });

  if (outputPath) {
    const destination = path.resolve(outputPath);
    fs.writeFileSync(destination, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log("[private-asset-dry-run] PASS: count-only manifest written; mutations=0");
  } else {
    console.log(JSON.stringify(manifest, null, 2));
  }
}

main()
  .catch((error) => {
    void error;
    console.error("[private-asset-dry-run] FAIL: read-only reconciliation could not complete; details suppressed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
