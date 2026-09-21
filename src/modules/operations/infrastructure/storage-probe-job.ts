import "server-only";
import { getDatabase } from "@/platform/db/client";
import { getRuntimePrivateImageStorage } from "@/modules/matches/infrastructure/runtime-private-assets";
import { createStorageProbeJob, type StorageProbeJobInput } from "./storage-probe-runner";

export async function runStorageProbeJob(input: StorageProbeJobInput) {
  return createStorageProbeJob({ database: getDatabase(), storage: getRuntimePrivateImageStorage() })(input);
}
